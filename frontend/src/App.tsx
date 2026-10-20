import { Link, Route, Routes, useLocation } from 'react-router-dom'
import { logout } from './api'
import { useAuth } from './auth'
import AuthProvider from './AuthProvider'
import GoogleSignIn from './GoogleSignIn'
import Minesweeper from './games/minesweeper/Minesweeper'
import WordlePage from './games/wordle/WordlePage.jsx'
import Leaderboard from './pages/leaderboard'
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
    <div className="auth ">
      <GoogleSignIn />
    </div>
  )
}

export default function App() {
  const isWordle = useLocation().pathname.replace(/\/+$/, '') === '/wordle'

  return (
    <AuthProvider>
      {!isWordle && (
        <nav className="topbar">
          <Link to="/" className="brand" id="logo">
            <img src="/logo.jpeg" alt="logo" className="logo" width="30" height="30" />
            Coding Club
          </Link>
          <Link to="/" className="brand">
            🕹️ Arcade
          </Link>
          <Link to="/leaderboard" className="brand">
            🏆 Leaderboard
          </Link>
          <AuthBar />
        </nav>
      )}
      
        <Routes>
          <Route path="/" element={<Hub />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/minesweeper" element={<Minesweeper />} />
          <Route path="/wordle" element={<WordlePage />} />
          <Route
            path="*"
            element={
              <p>
                Not found. <Link to="/">Back to the arcade</Link>
              </p>
            }
          />
        </Routes>
      
    </AuthProvider>
  )
}