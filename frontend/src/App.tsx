import { Link, Route, Routes, useLocation } from 'react-router-dom'
import { logout } from './api'
import { useAuth } from './auth'
import AuthProvider from './AuthProvider'
import GoogleSignIn from './GoogleSignIn'
import Minesweeper from './games/minesweeper/Minesweeper'
import Pacman from './games/pacman/Pacman'
import TetrisPage from './games/tetris/TetrisPage'
import WordlePage from './games/wordle/WordlePage.jsx'
import Snake from './games/snake/Snake'
import Flappy from './games/flappy_bird/flappy' // Imported Flappy Bird
import Leaderboard from './pages/leaderboard'
import Hub from './pages/Hub'

function AuthBar() {
  const { me } = useAuth()

  if (!me) {
    return (
      <div className="arcade-account">
        <div className="arcade-auth">
          <span className="arcade-auth-loading">Checking session…</span>
        </div>
      </div>
    )
  }

  if (me.authenticated) {
    return (
      <div className="arcade-account">
        <div className="arcade-auth">
          <div className="arcade-user">
            <span className="arcade-username">{me.username}</span>
            <span className="arcade-tickets">🎟 {me.tickets} ticket{me.tickets === 1 ? '' : 's'}</span>
          </div>
          <button
            type="button"
            className="arcade-logout"
            onClick={async () => {
              await logout()
              window.location.reload()
            }}
          >
            Log out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="arcade-account">
      <div className="arcade-auth">
        <GoogleSignIn />
      </div>
    </div>
  )
}

export default function App() {
  const location = useLocation()
  const isWordle = location.pathname.replace(/\/+$/, '') === '/wordle'
  const isMinesweeper = location.pathname.replace(/\/+$/, '') === '/minesweeper'
  const isPacman = location.pathname.replace(/\/+$/, '') === '/pacman'
  const isSnake = location.pathname.replace(/\/+$/, '') === '/snake'
  const isTetris = location.pathname.replace(/\/+$/, '') === '/tetris'
  const isFlappy = location.pathname.replace(/\/+$/, '') === '/flappy' // Added Flappy Bird path check

  if (isWordle) {
    return (
      <AuthProvider>
        <div className="wordle-route">
          <Routes>
            <Route path="/wordle" element={<WordlePage />} />
          </Routes>
        </div>
      </AuthProvider>
    )
  }

  if (isMinesweeper) {
    return (
      <AuthProvider>
        <Routes>
          <Route path="/minesweeper" element={<Minesweeper />} />
        </Routes>
      </AuthProvider>
    )
  }

  if (isPacman) {
    return (
      <AuthProvider>
        <Routes>
          <Route path="/pacman" element={<Pacman />} />
        </Routes>
      </AuthProvider>
    )
  }

  if (isSnake) {
    return (
      <AuthProvider>
        <Routes>
          <Route path="/snake" element={<Snake />} />
        </Routes>
      </AuthProvider>
    )
  }

  if (isTetris) {
    return (
      <AuthProvider>
        <TetrisPage />
      </AuthProvider>
    )
  }

  // Added Flappy Bird routing block
  if (isFlappy) {
    return (
      <AuthProvider>
        <Routes>
          <Route path="/flappy" element={<Flappy />} />
        </Routes>
      </AuthProvider>
    )
  }

  return (
    <AuthProvider>
      <div className="arcade-shell">
        <header className="arcade-header">
          <Link to="/" className="arcade-brand">
            <img src="/logo.jpeg" alt="Coding Club" width="36" height="36" />
            <span>
              <strong>CODING CLUB</strong>
              <small>ARCADE</small>
            </span>
          </Link>
          <nav className="arcade-navigation" aria-label="Main navigation">
            <Link to="/" className={location.pathname === '/' ? 'is-active' : ''}>
              Home
            </Link>
            <Link to="/leaderboard" className={location.pathname === '/leaderboard' ? 'is-active' : ''}>
              Leaderboard
            </Link>
          </nav>
          <AuthBar />
        </header>

        <Routes>
          <Route path="/" element={<Hub />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route
            path="*"
            element={
              <section className="arcade-not-found">
                <h1>404</h1>
                <p className="muted">Game cabinet not found.</p>
                <Link to="/">Back to the arcade</Link>
              </section>
            }
          />
        </Routes>
      </div>
    </AuthProvider>
  )
} 