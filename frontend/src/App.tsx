import { type FormEvent, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { type Credentials, clearCredentials, getCredentials, setCredentials } from './api'
import Minesweeper from './games/minesweeper/Minesweeper'
import Hub from './pages/Hub'

function AuthBar() {
  const [creds, setCreds] = useState<Credentials | null>(getCredentials)
  const [open, setOpen] = useState(false)

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setCreds(setCredentials(String(form.get('username')).trim(), String(form.get('password'))))
    setOpen(false)
    // Pages read credentials on render; reload so they pick up the change.
    window.location.reload()
  }

  if (creds) {
    return (
      <div className="auth">
        <span className="muted">{creds.username}</span>
        <button
          className="link"
          onClick={() => {
            clearCredentials()
            setCreds(null)
            window.location.reload()
          }}
        >
          Log out
        </button>
      </div>
    )
  }

  return open ? (
    <form className="auth" onSubmit={submit}>
      <input
        name="username"
        placeholder="Username"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
      />
      <input name="password" type="password" placeholder="Password" autoComplete="current-password" required />
      <button type="submit">Log in</button>
    </form>
  ) : (
    <div className="auth">
      <button onClick={() => setOpen(true)}>Log in</button>
    </div>
  )
}

export default function App() {
  return (
    <>
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
    </>
  )
}
