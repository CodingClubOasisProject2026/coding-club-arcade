import { lazy, Suspense, type ReactNode } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import { PageTransitionProvider, TransitionLink } from './PageTransition'
import { logout } from './api'
import { useAuth } from './auth'
import AuthProvider from './AuthProvider'
import GoogleSignIn from './GoogleSignIn'
import TetrisPage from './games/tetris/TetrisPage'
import ArcadeLoader from './loader/ArcadeLoader'
import Hub from './pages/Hub'

// Games load on demand; the arcade loader shows while a game's code downloads.
const Minesweeper = lazy(() => import('./games/minesweeper/Minesweeper'))
const Pacman = lazy(() => import('./games/pacman/Pacman'))
const WordlePage = lazy(() => import('./games/wordle/WordlePage.jsx'))
const Snake = lazy(() => import('./games/snake/Snake'))
const Flappy = lazy(() => import('./games/flappy_bird/flappy'))
const Leaderboard = lazy(() => import('./pages/leaderboard'))

function Loading({
  children,
  hideForGameTransition = false,
}: {
  children: ReactNode
  hideForGameTransition?: boolean
}) {
  const location = useLocation()
  const fromGameTransition = location.state?.fromGameTransition === true

  return (
    <Suspense
      fallback={
        hideForGameTransition && fromGameTransition ? null : <ArcadeLoader />
      }
    >
      {children}
    </Suspense>
  )
}

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
            <Route path="/wordle" element={<Loading hideForGameTransition><WordlePage /></Loading>} />
          </Routes>
        </div>
      </AuthProvider>
    )
  }

  if (isMinesweeper) {
    return (
      <AuthProvider>
        <Routes>
          <Route path="/minesweeper" element={<Loading hideForGameTransition><Minesweeper /></Loading>} />
        </Routes>
      </AuthProvider>
    )
  }

  if (isPacman) {
    return (
      <AuthProvider>
        <Routes>
          <Route path="/pacman" element={<Loading hideForGameTransition><Pacman /></Loading>} />
        </Routes>
      </AuthProvider>
    )
  }

  if (isSnake) {
    return (
      <AuthProvider>
        <Routes>
          <Route path="/snake" element={<Loading hideForGameTransition><Snake /></Loading>} />
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
          <Route path="/flappy" element={<Loading hideForGameTransition><Flappy /></Loading>} />
        </Routes>
      </AuthProvider>
    )
  }

  return (
    <AuthProvider>
      <PageTransitionProvider>
        <div className="arcade-shell">
          <header className="arcade-header">
            <Link to="/" className="arcade-brand">
              <img src="/logo.webp" alt="Coding Club" width="36" height="36" />
              <span>
                <strong>CODING CLUB</strong>
                <small>ARCADE</small>
              </span>
            </Link>
            <nav className="arcade-navigation" aria-label="Main navigation">
              <Link to="/" className={location.pathname === '/' ? 'is-active' : ''}>
                Home
              </Link>
              <TransitionLink to="/leaderboard" className={location.pathname === '/leaderboard' ? 'is-active' : ''}>
                Leaderboard
              </TransitionLink>
            </nav>
            <AuthBar />
          </header>

          <Routes>
            <Route path="/" element={<Hub />} />
            <Route path="/leaderboard" element={<Loading><Leaderboard /></Loading>} />
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
      </PageTransitionProvider>
    </AuthProvider>
  )
} 