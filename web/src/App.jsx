// Minimal path router (no extra dependency). Routes are served by FastAPI's SPA fallback.
import Home from './pages/Home'
import ShopApp from './pages/ShopApp'
import Dashboard from './pages/Dashboard'
import Pay from './pages/Pay'
import Supply from './pages/Supply'

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  if (path === '/app') return <ShopApp />
  if (path === '/dashboard') return <Dashboard />
  const pay = path.match(/^\/pay\/([\w-]+)$/)
  if (pay) return <Pay id={pay[1]} />
  const supply = path.match(/^\/supply\/([\w-]+)$/)
  if (supply) return <Supply id={supply[1]} />
  return <Home />
}
