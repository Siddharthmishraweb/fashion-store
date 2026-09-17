import { lazy, Suspense, useEffect, useRef } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { TenantProvider } from './context/TenantContext.jsx'
import { Button, ErrorBoundary, Skeleton } from './components/common/index.jsx'
import { useAuth } from './context/AuthContext.jsx'
import { useToast } from './context/ToastContext.jsx'
import { hasPermission, ROLES } from './config/constants.js'
import { DEFAULT_STORE_SLUG } from './config/env.js'

const named = (loader, name) => lazy(() => loader().then((mod) => ({ default: mod[name] })))

const PlatformHome = lazy(() => import('./pages/platform/Home.jsx'))
const StoreHome = lazy(() => import('./pages/storefront/Home.jsx'))
const ProductList = lazy(() => import('./pages/storefront/ProductList.jsx'))
const ProductDetail = lazy(() => import('./pages/storefront/ProductDetail.jsx'))
const CartPage = lazy(() => import('./pages/storefront/CartWishlist.jsx'))
const WishlistPage = named(() => import('./pages/storefront/CartWishlist.jsx'), 'WishlistPage')
const CheckoutPage = lazy(() => import('./pages/storefront/CheckoutAuth.jsx'))
const AuthPage = named(() => import('./pages/storefront/CheckoutAuth.jsx'), 'AuthPage')
const AccountLayout = named(() => import('./pages/storefront/Account.jsx'), 'AccountLayout')
const AccountHome = named(() => import('./pages/storefront/Account.jsx'), 'AccountHome')
const OrdersPage = named(() => import('./pages/storefront/Account.jsx'), 'OrdersPage')
const OrderDetailPage = named(() => import('./pages/storefront/Account.jsx'), 'OrderDetailPage')
const SimpleAccount = named(() => import('./pages/storefront/Account.jsx'), 'SimpleAccount')
const NotificationsPage = named(() => import('./pages/storefront/Account.jsx'), 'NotificationsPage')
const StorefrontShell = named(() => import('./components/layout/StorefrontShell.jsx'), 'StorefrontShell')

const AdminDashboard = lazy(() => import('./pages/admin/Dashboard.jsx'))
const CustomizerPage = lazy(() => import('./pages/admin/Customizer.jsx'))
const AdminShell = named(() => import('./components/admin/AdminChrome.jsx'), 'AdminShell')
const SuperAdminShell = named(() => import('./components/admin/AdminChrome.jsx'), 'SuperAdminShell')
const ProductsAdmin = named(() => import('./pages/admin/Resources.jsx'), 'ProductsAdmin')
const ProductEditor = named(() => import('./pages/admin/Resources.jsx'), 'ProductEditor')
const CategoriesAdmin = named(() => import('./pages/admin/Resources.jsx'), 'CategoriesAdmin')
const CollectionsAdmin = named(() => import('./pages/admin/Resources.jsx'), 'CollectionsAdmin')
const OrdersAdmin = named(() => import('./pages/admin/Resources.jsx'), 'OrdersAdmin')
const OrderAdminDetail = named(() => import('./pages/admin/Resources.jsx'), 'OrderAdminDetail')
const CustomersAdmin = named(() => import('./pages/admin/Resources.jsx'), 'CustomersAdmin')
const CustomerAdminDetail = named(() => import('./pages/admin/Resources.jsx'), 'CustomerAdminDetail')
const InventoryAdmin = named(() => import('./pages/admin/Resources.jsx'), 'InventoryAdmin')
const CouponsAdmin = named(() => import('./pages/admin/Resources.jsx'), 'CouponsAdmin')
const ReviewsAdmin = named(() => import('./pages/admin/Resources.jsx'), 'ReviewsAdmin')
const TeamAdmin = named(() => import('./pages/admin/Resources.jsx'), 'TeamAdmin')
const StoreSettingsAdmin = named(() => import('./pages/admin/Resources.jsx'), 'StoreSettingsAdmin')
const BannersAdmin = named(() => import('./pages/admin/Banners.jsx'), 'BannersAdmin')

const SuperDashboard = lazy(() => import('./pages/superAdmin/index.jsx'))
const StoresAdmin = named(() => import('./pages/superAdmin/index.jsx'), 'StoresAdmin')
const ThemesAdmin = named(() => import('./pages/superAdmin/index.jsx'), 'ThemesAdmin')
const UsersAdmin = named(() => import('./pages/superAdmin/index.jsx'), 'UsersAdmin')
const SuperSettings = named(() => import('./pages/superAdmin/index.jsx'), 'SuperSettings')
const NotFound = lazy(() => import('./pages/NotFound.jsx'))

const STORE_ROLES = [
  ROLES.STORE_OWNER,
  ROLES.STORE_ADMIN,
  ROLES.STORE_MANAGER,
  ROLES.CONTENT_MANAGER,
  ROLES.INVENTORY_MANAGER,
]

function RouteFallback() {
  return (
    <div className="container" style={{ padding: '2rem 0' }}>
      <Skeleton height={320} radius={4} />
    </div>
  )
}

/** Resets scroll on navigation, but keeps position when the browser goes back. */
function ScrollManager() {
  const { pathname, search, key } = useLocation()
  const seen = useRef(new Set())
  useEffect(() => {
    if (seen.current.has(key)) return
    seen.current.add(key)
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname, search, key])
  return null
}

function SessionWatcher() {
  const { expired } = useAuth()
  const { push } = useToast()
  useEffect(() => {
    if (expired) push('Your session ended. Please sign in again.')
  }, [expired, push])
  return null
}

function StoreRoot() {
  const { slug } = useParams()
  return (
    <TenantProvider slug={slug}>
      <StorefrontShell />
    </TenantProvider>
  )
}

function Guard({ roles, permission, children }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  const isSuper = user.role === ROLES.SUPER_ADMIN
  const roleOk = isSuper || !roles || roles.includes(user.role)
  const permissionOk = !permission || hasPermission(user.role, permission)
  if (!roleOk || !permissionOk) {
    return (
      <div className="denied">
        <div>
          <h1>You do not have access to this page</h1>
          <p className="muted">Ask the store owner to grant your account the right role.</p>
          <Button onClick={() => window.history.back()}>Go back</Button>
        </div>
      </div>
    )
  }
  return children
}

function GlobalLogin() {
  return (
    <TenantProvider slug={DEFAULT_STORE_SLUG}>
      <AuthPage />
    </TenantProvider>
  )
}

export default function App() {
  return (
    <>
      <ScrollManager />
      <SessionWatcher />
      <ErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<PlatformHome />} />
            <Route path="/login" element={<GlobalLogin />} />

            <Route path="/store/:slug" element={<StoreRoot />}>
              <Route index element={<StoreHome />} />
              <Route path="products" element={<ProductList mode="all" />} />
              <Route path="category/:category" element={<ProductList />} />
              <Route path="product/:productSlug" element={<ProductDetail />} />
              <Route path="search" element={<ProductList mode="search" />} />
              <Route path="cart" element={<CartPage />} />
              <Route path="wishlist" element={<WishlistPage />} />
              <Route path="checkout" element={<CheckoutPage />} />
              <Route path="login" element={<AuthPage />} />
              <Route path="account" element={<AccountLayout />}>
                <Route index element={<Navigate to="profile" replace />} />
                <Route path="profile" element={<AccountHome />} />
                <Route path="orders" element={<OrdersPage />} />
                <Route path="orders/:orderId" element={<OrderDetailPage />} />
                <Route path="wishlist" element={<WishlistPage />} />
                <Route path="addresses" element={<SimpleAccount title="Addresses" body="Delivery addresses you save at checkout appear here." />} />
                <Route path="payments" element={<SimpleAccount title="Saved payments" body="Cards and UPI handles are tokenised by the payment gateway and never stored here." />} />
                <Route path="coupons" element={<SimpleAccount title="Coupons" body="WELCOME10 gives 10% off your first order above ₹4,999." />} />
                <Route path="returns" element={<SimpleAccount title="Returns" body="You have no open returns. Returns are accepted within 7 days of delivery." />} />
                <Route path="reviews" element={<SimpleAccount title="Reviews" body="Reviews you write on product pages are listed here." />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="preferences" element={<SimpleAccount title="Preferences" body="Language and communication preferences for this storefront." />} />
              </Route>
              <Route path="*" element={<NotFound scope="store" />} />
            </Route>

            <Route
              path="/admin"
              element={
                <Guard roles={STORE_ROLES}>
                  <AdminShell />
                </Guard>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="products" element={<Guard permission="store.products"><ProductsAdmin /></Guard>} />
              <Route path="products/new" element={<Guard permission="store.products"><ProductEditor /></Guard>} />
              <Route path="products/:id" element={<Guard permission="store.products"><ProductEditor /></Guard>} />
              <Route path="categories" element={<Guard permission="store.categories"><CategoriesAdmin /></Guard>} />
              <Route path="collections" element={<Guard permission="store.collections"><CollectionsAdmin /></Guard>} />
              <Route path="orders" element={<Guard permission="store.orders"><OrdersAdmin /></Guard>} />
              <Route path="orders/:id" element={<Guard permission="store.orders"><OrderAdminDetail /></Guard>} />
              <Route path="customers" element={<Guard permission="store.customers"><CustomersAdmin /></Guard>} />
              <Route path="customers/:id" element={<Guard permission="store.customers"><CustomerAdminDetail /></Guard>} />
              <Route path="inventory" element={<Guard permission="store.inventory"><InventoryAdmin /></Guard>} />
              <Route path="banners" element={<Guard permission="store.banners"><BannersAdmin /></Guard>} />
              <Route path="coupons" element={<Guard permission="store.coupons"><CouponsAdmin /></Guard>} />
              <Route path="reviews" element={<Guard permission="store.reviews"><ReviewsAdmin /></Guard>} />
              <Route path="analytics" element={<Guard permission="store.analytics"><AdminDashboard /></Guard>} />
              <Route path="customize" element={<Guard permission="store.appearance"><CustomizerPage /></Guard>} />
              <Route path="homepage" element={<Navigate to="/admin/customize" replace />} />
              <Route path="team" element={<Guard permission="store.users"><TeamAdmin /></Guard>} />
              <Route path="settings" element={<Guard permission="store.settings"><StoreSettingsAdmin /></Guard>} />
              <Route path="*" element={<NotFound />} />
            </Route>

            <Route
              path="/super-admin"
              element={
                <Guard roles={[ROLES.SUPER_ADMIN]}>
                  <SuperAdminShell />
                </Guard>
              }
            >
              <Route index element={<SuperDashboard />} />
              <Route path="stores" element={<StoresAdmin />} />
              <Route path="themes" element={<ThemesAdmin />} />
              <Route path="users" element={<UsersAdmin />} />
              <Route path="analytics" element={<SuperDashboard />} />
              <Route path="settings" element={<SuperSettings />} />
              <Route path="*" element={<NotFound />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </>
  )
}
