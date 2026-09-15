import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useCart } from '../../context/CommerceContext.jsx'
import { useTenant } from '../../context/TenantContext.jsx'
import { Button, EmptyState, Input, OptimizedImage, Select, Seo, Skeleton } from '../../components/common/index.jsx'
import { ordersApi } from '../../services/api/index.js'
import { authApi } from '../../services/api/auth.js'
import { useSubmit } from '../../hooks/index.js'
import { formatCurrency } from '../../utils/index.js'
import { isEmail, isPhone, isPin, passwordIssues } from '../../utils/security.js'
import { useI18n } from '../../context/I18nContext.jsx'
import { DEFAULT_STORE_SLUG } from '../../config/env.js'
import { ROLES } from '../../config/constants.js'

const STEPS = [
  ['identity', 'Contact'],
  ['address', 'Delivery'],
  ['delivery', 'Shipping'],
  ['payment', 'Payment'],
]

const ADDRESS_FIELDS = [
  ['name', 'Full name', { required: true }],
  ['phone', 'Mobile number', { required: true, inputMode: 'tel' }],
  ['address', 'House / street', { required: true }],
  ['apartment', 'Apartment, landmark'],
  ['city', 'City', { required: true }],
  ['state', 'State', { required: true }],
  ['pin', 'PIN code', { required: true, inputMode: 'numeric', maxLength: 6 }],
]

function addressErrors(form) {
  const errors = {}
  if (!form.name.trim()) errors.name = 'Enter the recipient name.'
  if (!isPhone(form.phone)) errors.phone = 'Enter a reachable 10-digit mobile number.'
  if (!form.address.trim()) errors.address = 'Enter the house and street.'
  if (!form.city.trim()) errors.city = 'Enter the city.'
  if (!form.state.trim()) errors.state = 'Enter the state.'
  if (!isPin(form.pin)) errors.pin = 'Enter a valid 6-digit PIN code.'
  return errors
}

export default function CheckoutPage() {
  const { user } = useAuth()
  const { items, totals, clear, coupon } = useCart()
  const { tenant } = useTenant()
  const { t } = useI18n()
  const [step, setStep] = useState(user ? 'address' : 'identity')
  const [order, setOrder] = useState(null)
  const [touched, setTouched] = useState(false)
  const [form, setForm] = useState({
    email: user?.email || '',
    name: user?.name || '',
    phone: user?.phone || '',
    address: '',
    apartment: '',
    city: '',
    state: '',
    pin: '',
    delivery: 'standard',
    paymentMethod: 'upi',
  })
  const base = `/store/${tenant.slug}`
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const errors = addressErrors(form)

  const { submit: placeOrder, pending, error } = useSubmit(async () => {
    const created = await ordersApi.checkout({
      tenantId: tenant.id,
      items: items.map((i) => ({ productId: i.id, qty: i.qty })),
      address: form,
      email: form.email,
      paymentMethod: form.paymentMethod,
      couponCode: coupon?.coupon?.code || '',
    })
    setOrder(created)
    clear()
  })

  if (order) {
    return (
      <div className="container confirm-page">
        <Seo title={`Order ${order.number} confirmed · ${tenant.name}`} noindex />
        <div className="confirm-card">
          <p className="caption">Thank you</p>
          <h1>Your order is confirmed</h1>
          <p className="muted">
            Order <b>{order.number}</b> · {formatCurrency(order.totals.total)} · {order.paymentMethod.toUpperCase()}
          </p>
          <p className="muted">
            We have emailed the details to {order.customerEmail || form.email || 'you'}. Dispatch takes 2–4 days and we
            will share tracking as soon as it leaves the atelier.
          </p>
          <div className="confirm-actions">
            <Link className="btn" to={`${base}/account/orders/${order.id}`}>Track this order</Link>
            <Link className="btn btn-ghost" to={`${base}/products`}>Continue shopping</Link>
          </div>
        </div>
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="container" style={{ padding: '3rem 0' }}>
        <EmptyState
          title="Your bag is empty"
          hint="Add a weave before checking out."
          action={<Link className="btn" to={`${base}/products`}>Continue shopping</Link>}
        />
      </div>
    )
  }

  const goToPayment = () => setStep('payment')

  return (
    <div className="container checkout">
      <Seo title={`Checkout · ${tenant.name}`} noindex />
      <div>
        <ol className="steps">
          {STEPS.map(([id, label], i) => (
            <li key={id} className={step === id ? 'on' : STEPS.findIndex(([s]) => s === step) > i ? 'done' : ''}>
              <span>{i + 1}</span>
              {label}
            </li>
          ))}
        </ol>

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        {step === 'identity' ? (
          <section className="checkout-step">
            <h2>How can we reach you?</h2>
            <p className="muted">Sign in to use saved addresses, or continue as a guest.</p>
            <Input
              label="Email for order updates"
              type="email"
              required
              value={form.email}
              error={touched && !isEmail(form.email) ? 'Enter a valid email address.' : undefined}
              onChange={(e) => set('email', e.target.value)}
            />
            <div className="form-actions">
              <Button
                onClick={() => {
                  setTouched(true)
                  if (isEmail(form.email)) setStep('address')
                }}
              >
                Continue as guest
              </Button>
              <Link className="btn btn-ghost" to={`${base}/login`}>Sign in instead</Link>
            </div>
          </section>
        ) : null}

        {step === 'address' ? (
          <section className="checkout-step">
            <h2>Delivery address</h2>
            <form
              className="grid-2"
              onSubmit={(e) => {
                e.preventDefault()
                setTouched(true)
                if (!Object.keys(errors).length) setStep('delivery')
              }}
            >
              {ADDRESS_FIELDS.map(([key, label, opts = {}]) => (
                <Input
                  key={key}
                  label={label}
                  value={form[key]}
                  required={opts.required}
                  inputMode={opts.inputMode}
                  maxLength={opts.maxLength}
                  error={touched ? errors[key] : undefined}
                  onChange={(e) => set(key, opts.inputMode === 'numeric' ? e.target.value.replace(/\D/g, '') : e.target.value)}
                />
              ))}
              <div className="form-actions span-2">
                <Button type="submit">Continue to shipping</Button>
              </div>
            </form>
          </section>
        ) : null}

        {step === 'delivery' ? (
          <section className="checkout-step">
            <h2>Shipping method</h2>
            <Select
              label="Choose a speed"
              value={form.delivery}
              onChange={(e) => set('delivery', e.target.value)}
              options={[
                { value: 'standard', label: 'Standard · 3–6 days · free over ₹2,999' },
                { value: 'express', label: 'Express · 1–2 days' },
              ]}
            />
            <div className="form-actions">
              <Button variant="ghost" onClick={() => setStep('address')}>Back</Button>
              <Button onClick={goToPayment}>Continue to payment</Button>
            </div>
          </section>
        ) : null}

        {step === 'payment' ? (
          <section className="checkout-step">
            <h2>Payment</h2>
            <Select
              label="Payment method"
              value={form.paymentMethod}
              onChange={(e) => set('paymentMethod', e.target.value)}
              options={[
                { value: 'upi', label: 'UPI' },
                { value: 'card', label: 'Credit or debit card' },
                { value: 'netbanking', label: 'Net banking' },
                { value: 'cod', label: 'Cash on delivery' },
              ]}
            />
            <p className="muted">
              Card details are captured by the payment gateway, never by this storefront. Your bag is re-priced on the
              server before the order is created.
            </p>
            <div className="form-actions">
              <Button variant="ghost" onClick={() => setStep('delivery')}>Back</Button>
              <Button loading={pending} onClick={placeOrder}>{t('action.placeOrder')}</Button>
            </div>
          </section>
        ) : null}
      </div>

      <aside className="summary-card">
        <h2>Order summary</h2>
        <ul className="mini-lines">
          {items.map((i) => (
            <li key={i.id}>
              <OptimizedImage src={i.image} alt="" sizes="56px" />
              <span>
                {i.name}
                <small className="muted">Qty {i.qty}</small>
              </span>
              <b>{formatCurrency(i.price * i.qty)}</b>
            </li>
          ))}
        </ul>
        <dl className="totals">
          <div><dt>Subtotal</dt><dd>{formatCurrency(totals.subtotal)}</dd></div>
          {totals.discount ? <div className="is-credit"><dt>Discount</dt><dd>−{formatCurrency(totals.discount)}</dd></div> : null}
          <div><dt>Shipping</dt><dd>{totals.shipping ? formatCurrency(totals.shipping) : 'Complimentary'}</dd></div>
          <div className="grand"><dt>Total</dt><dd>{formatCurrency(totals.total)}</dd></div>
        </dl>
        <p className="caption">Final amount is confirmed by our server at the moment of payment.</p>
      </aside>
    </div>
  )
}

export function AuthPage() {
  const { login, register, verifyOtp } = useAuth()
  const { tenant, loading } = useTenant()
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const [tab, setTab] = useState('login')
  const [form, setForm] = useState({ email: '', password: '', name: '', phone: '', otp: '' })
  const [otpSent, setOtpSent] = useState(false)

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const go = (account) => {
    const from = location.state?.from
    if (account.role === ROLES.SUPER_ADMIN) navigate('/super-admin', { replace: true })
    else if (account.role !== ROLES.CUSTOMER) navigate(from?.startsWith('/admin') ? from : '/admin', { replace: true })
    else navigate(from || `/store/${tenant?.slug || DEFAULT_STORE_SLUG}/account`, { replace: true })
  }

  const signIn = useSubmit(async () => {
    if (!isEmail(form.email)) throw new Error('Enter a valid email address.')
    if (!form.password) throw new Error('Enter your password.')
    go(await login({ email: form.email, password: form.password }))
  })

  const createAccount = useSubmit(async () => {
    if (!form.name.trim()) throw new Error('Enter your name.')
    if (!isEmail(form.email)) throw new Error('Enter a valid email address.')
    const issues = passwordIssues(form.password)
    if (issues.length) throw new Error(`Password needs ${issues.join(', ')}.`)
    go(await register({ ...form, tenantId: tenant.id }))
  })

  const otpFlow = useSubmit(async () => {
    if (!isPhone(form.phone)) throw new Error('Enter a valid mobile number.')
    if (!otpSent) {
      await authApi.requestOtp({ phone: form.phone })
      setOtpSent(true)
      return
    }
    go(await verifyOtp({ phone: form.phone, otp: form.otp, tenantId: tenant.id }))
  })

  if (loading || !tenant) {
    return (
      <div className="container" style={{ maxWidth: 460, padding: '3rem 0' }}>
        <Skeleton height={320} radius={4} />
      </div>
    )
  }

  return (
    <div className="container auth-page">
      <Seo title={`Sign in · ${tenant.name}`} noindex />
      <h1>{tab === 'register' ? t('action.register') : t('action.login')}</h1>
      <p className="muted">{t('auth.otpHint')}</p>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'login'} className={tab === 'login' ? 'on' : ''} onClick={() => setTab('login')}>Email</button>
        <button type="button" role="tab" aria-selected={tab === 'otp'} className={tab === 'otp' ? 'on' : ''} onClick={() => setTab('otp')}>Mobile OTP</button>
        <button type="button" role="tab" aria-selected={tab === 'register'} className={tab === 'register' ? 'on' : ''} onClick={() => setTab('register')}>Register</button>
      </div>

      {tab === 'login' ? (
        <form onSubmit={(e) => { e.preventDefault(); signIn.submit() }}>
          {signIn.error ? <p className="form-error" role="alert">{signIn.error}</p> : null}
          <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          <Input label="Password" type="password" autoComplete="current-password" value={form.password} onChange={(e) => set('password', e.target.value)} />
          <Button type="submit" className="btn-block" loading={signIn.pending}>Sign in</Button>
        </form>
      ) : null}

      {tab === 'register' ? (
        <form onSubmit={(e) => { e.preventDefault(); createAccount.submit() }}>
          {createAccount.error ? <p className="form-error" role="alert">{createAccount.error}</p> : null}
          <Input label="Name" autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} />
          <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          <Input label="Mobile" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            hint="At least 8 characters with an uppercase letter, a lowercase letter, and a number."
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
          />
          <Button type="submit" className="btn-block" loading={createAccount.pending}>Create account</Button>
        </form>
      ) : null}

      {tab === 'otp' ? (
        <form onSubmit={(e) => { e.preventDefault(); otpFlow.submit() }}>
          {otpFlow.error ? <p className="form-error" role="alert">{otpFlow.error}</p> : null}
          <Input label="Mobile number" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          {otpSent ? (
            <Input
              label="6-digit code"
              inputMode="numeric"
              maxLength={6}
              hint="Use 123456 in this demo"
              value={form.otp}
              onChange={(e) => set('otp', e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          ) : null}
          <Button type="submit" className="btn-block" loading={otpFlow.pending}>{otpSent ? 'Verify and continue' : 'Send code'}</Button>
        </form>
      ) : null}

      <div className="demo-creds">
        <p className="caption">Demo accounts</p>
        <ul>
          <li>Shopper — priya@example.com / Customer@123</li>
          <li>Store owner — admin@{tenant.slug}.test / Admin@123</li>
          <li>Platform operator — super@vastrika.market / Super@123</li>
        </ul>
      </div>
    </div>
  )
}
