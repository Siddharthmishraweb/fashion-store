import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { env } from './config/env.js'
import { AuthProvider } from './context/AuthContext.jsx'
import { I18nProvider } from './context/I18nContext.jsx'
import { ToastProvider } from './context/ToastContext.jsx'
import './index.css'

const loc = window.location
if (loc.search[1] === '/') {
  const decoded = loc.search.slice(1).split('&').map((part) => part.replace(/~and~/g, '&')).join('?')
  const base = loc.pathname.endsWith('/') ? loc.pathname.slice(0, -1) : loc.pathname
  window.history.replaceState(null, '', `${base}${decoded}${loc.hash}`)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={env.basePath || undefined}>
      <I18nProvider>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
)
