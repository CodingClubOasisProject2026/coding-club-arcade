import { Link, Route, Routes } from 'react-router-dom'
import { logout } from './api'
import { useAuth } from './auth'
import AuthProvider from './AuthProvider'
import GoogleSignIn from './GoogleSignIn'
import Minesweeper from './games/minesweeper/Minesweeper'
import Hub from './pages/Hub'

function AuthBar() {
  const { me } = useAuth()

  if (!me) return <div className="auth" />

  if (me.authenticated) {
    return (
      <div className="auth">
        <span className="muted">
          {me.username} · 🎟 {me.tickets}
        </span>
        <button
          className="link"
          onClick={async () => {
            await logout()
            window.location.reload()
          }}
        >
          Log out
        </button>
      </div>
    )
  }

  return (
    <div className="auth">
      <GoogleSignIn />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <nav className="topbar">
        <Link to="/" className="brand">
          🕹️ Arcade
        </Link>
        <AuthBar />
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Hub />} />
          <Route path="/minesweeper" element={<Minesweeper />} />
          <Route
            path="*"
            element={
              <p>
                Not found. <Link to="/">Back to the arcade</Link>
              </p>
            }
          />
        </Routes>
      </main>
    </AuthProvider>
  )
}
