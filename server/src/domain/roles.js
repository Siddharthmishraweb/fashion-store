/*
 * Authoritative copy of the permission matrix. The client has the same table so
 * it can hide navigation a user cannot use, but only this one is enforced.
 * Mirrors src/config/constants.js.
 */

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  STORE_OWNER: 'store_owner',
  STORE_ADMIN: 'store_admin',
  STORE_MANAGER: 'store_manager',
  CONTENT_MANAGER: 'content_manager',
  INVENTORY_MANAGER: 'inventory_manager',
  CUSTOMER: 'customer',
}

const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: ['*'],
  [ROLES.STORE_OWNER]: [
    'store.dashboard', 'store.products', 'store.categories', 'store.collections',
    'store.orders', 'store.customers', 'store.inventory', 'store.banners',
    'store.homepage', 'store.coupons', 'store.reviews', 'store.analytics',
    'store.appearance', 'store.settings', 'store.users',
  ],
  [ROLES.STORE_ADMIN]: [
    'store.dashboard', 'store.products', 'store.categories', 'store.collections',
    'store.orders', 'store.customers', 'store.inventory', 'store.banners',
    'store.homepage', 'store.coupons', 'store.reviews', 'store.analytics',
    'store.appearance', 'store.settings',
  ],
  [ROLES.STORE_MANAGER]: [
    'store.dashboard', 'store.products', 'store.orders', 'store.customers', 'store.inventory',
  ],
  [ROLES.CONTENT_MANAGER]: [
    'store.dashboard', 'store.banners', 'store.homepage', 'store.appearance',
    'store.collections', 'store.categories',
  ],
  [ROLES.INVENTORY_MANAGER]: ['store.dashboard', 'store.products', 'store.inventory'],
  [ROLES.CUSTOMER]: ['account'],
}

export function hasPermission(role, permission) {
  const granted = ROLE_PERMISSIONS[role] || []
  return granted.includes('*') || granted.includes(permission)
}

export const STAFF_ROLES = [
  ROLES.STORE_OWNER, ROLES.STORE_ADMIN, ROLES.STORE_MANAGER,
  ROLES.CONTENT_MANAGER, ROLES.INVENTORY_MANAGER,
]

/** Roles a store's own team page is allowed to assign. Owner is excluded. */
export const ASSIGNABLE_ROLES = [
  ROLES.STORE_ADMIN, ROLES.STORE_MANAGER, ROLES.CONTENT_MANAGER, ROLES.INVENTORY_MANAGER,
]

export const ORDER_STATUS = [
  'placed', 'confirmed', 'packed', 'shipped', 'out_for_delivery',
  'delivered', 'cancelled', 'returned', 'refunded',
]

/** Statuses that may no longer change: prevents un-cancelling a refunded order. */
export const TERMINAL_STATUS = ['delivered', 'cancelled', 'returned', 'refunded']
