import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { STORAGE_KEYS } from '../config/env.js'
import { readStorage, writeStorage } from '../utils/index.js'
import { useToast } from './ToastContext.jsx'
import { useI18n } from './I18nContext.jsx'

const CartContext = createContext(null)
const WishlistContext = createContext(null)

const MAX_QTY_PER_ITEM = 10
const MAX_LINES = 30
const FREE_SHIPPING_FROM = 2999
const FLAT_SHIPPING = 149

function scopedKey(base, tenantId) {
  return tenantId ? `${base}.${tenantId}` : base
}

function toLine(product, qty) {
  return {
    id: product.id,
    name: product.name,
    price: Number(product.price) || 0,
    mrp: Number(product.mrp) || 0,
    image: product.images?.[0]?.src || product.image || '',
    slug: product.slug,
    brand: product.brand,
    inventory: Number(product.inventory ?? MAX_QTY_PER_ITEM),
    qty,
  }
}

/** Keeps a list in state and localStorage under one tenant-scoped key. */
function usePersistentList(baseKey, tenantId) {
  const key = scopedKey(baseKey, tenantId)
  const [items, setItems] = useState(() => readStorage(key, []))
  const keyRef = useRef(key)

  useEffect(() => {
    keyRef.current = key
    setItems(readStorage(key, []))
  }, [key])

  // Keep multiple tabs of the same storefront consistent.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === keyRef.current) setItems(readStorage(keyRef.current, []))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const update = useCallback((recipe) => {
    setItems((current) => {
      const next = typeof recipe === 'function' ? recipe(current) : recipe
      writeStorage(keyRef.current, next)
      return next
    })
  }, [])

  return [items, update]
}

export function CartProvider({ tenantId, children }) {
  const { push } = useToast()
  const { t } = useI18n()
  const [items, update] = usePersistentList(STORAGE_KEYS.cart, tenantId)
  const [saved, setSaved] = useState([])
  const [coupon, setCoupon] = useState(null)

  const add = useCallback((product, qty = 1) => {
    const requested = Math.max(1, Math.min(MAX_QTY_PER_ITEM, Math.round(qty) || 1))
    let message = t('toast.addedCart')
    update((current) => {
      const existing = current.find((i) => i.id === product.id)
      const stock = Math.max(0, Number(product.inventory ?? MAX_QTY_PER_ITEM))
      const ceiling = Math.min(MAX_QTY_PER_ITEM, stock || MAX_QTY_PER_ITEM)

      if (existing) {
        const nextQty = Math.min(ceiling, existing.qty + requested)
        if (nextQty === existing.qty) {
          message = `You already have the maximum available quantity of ${product.name}.`
          return current
        }
        return current.map((i) => (i.id === product.id ? { ...i, qty: nextQty, price: Number(product.price) || i.price } : i))
      }
      if (current.length >= MAX_LINES) {
        message = 'Your bag is full. Please check out or remove an item.'
        return current
      }
      return [...current, toLine(product, Math.min(ceiling, requested))]
    })
    push(message)
  }, [update, push, t])

  const updateQty = useCallback((id, qty) => {
    update((current) =>
      current.map((i) =>
        i.id === id
          ? { ...i, qty: Math.max(1, Math.min(MAX_QTY_PER_ITEM, Math.min(i.inventory || MAX_QTY_PER_ITEM, Math.round(qty) || 1))) }
          : i,
      ),
    )
  }, [update])

  const remove = useCallback((id) => update((current) => current.filter((i) => i.id !== id)), [update])

  const saveForLater = useCallback((id) => {
    update((current) => {
      const item = current.find((i) => i.id === id)
      if (item) setSaved((list) => (list.some((i) => i.id === id) ? list : [...list, item]))
      return current.filter((i) => i.id !== id)
    })
  }, [update])

  const moveToCart = useCallback((id) => {
    setSaved((list) => {
      const item = list.find((i) => i.id === id)
      if (item) add(item, item.qty)
      return list.filter((i) => i.id !== id)
    })
  }, [add])

  const clear = useCallback(() => {
    update([])
    setCoupon(null)
  }, [update])

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0)
    const mrpTotal = items.reduce((sum, i) => sum + (i.mrp || i.price) * i.qty, 0)
    const discount = Math.min(subtotal, coupon?.discount || 0)
    const shipping = subtotal === 0 || subtotal - discount >= FREE_SHIPPING_FROM ? 0 : FLAT_SHIPPING
    // Catalogue prices are GST inclusive, so tax is shown as a breakdown of the
    // subtotal rather than added on top.
    const includedTax = Math.round((subtotal / 1.05) * 0.05)
    return {
      subtotal,
      mrpTotal,
      savings: Math.max(0, mrpTotal - subtotal) + discount,
      discount,
      shipping,
      includedTax,
      freeShippingGap: Math.max(0, FREE_SHIPPING_FROM - (subtotal - discount)),
      total: Math.max(0, subtotal - discount + shipping),
    }
  }, [items, coupon])

  const value = useMemo(
    () => ({
      items,
      add,
      updateQty,
      remove,
      saveForLater,
      moveToCart,
      saved,
      clear,
      coupon,
      setCoupon,
      totals,
      count: items.reduce((s, i) => s + i.qty, 0),
      maxQty: MAX_QTY_PER_ITEM,
    }),
    [items, add, updateQty, remove, saveForLater, moveToCart, saved, clear, coupon, totals],
  )
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function WishlistProvider({ tenantId, children }) {
  const { push } = useToast()
  const { t } = useI18n()
  const [items, update] = usePersistentList(STORAGE_KEYS.wishlist, tenantId)

  const toggle = useCallback((product) => {
    let removed = false
    update((current) => {
      removed = current.some((i) => i.id === product.id)
      if (removed) return current.filter((i) => i.id !== product.id)
      return [...current, toLine(product, 1)]
    })
    push(removed ? t('toast.removedWishlist') : t('toast.addedWishlist'))
  }, [update, push, t])

  const remove = useCallback((id) => update((current) => current.filter((i) => i.id !== id)), [update])
  const has = useCallback((id) => items.some((i) => i.id === id), [items])

  const value = useMemo(() => ({ items, toggle, remove, has, count: items.length }), [items, toggle, remove, has])
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

export function useCart() {
  return useContext(CartContext)
}

export function useWishlist() {
  return useContext(WishlistContext)
}
