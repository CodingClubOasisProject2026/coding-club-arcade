import { useLocation } from 'react-router-dom'
import { csrfToken } from './api'

/**
 * Starts allauth's Google flow. A CSRF-protected POST goes straight to Google; without a
 * token yet (the cookie comes from /me/), fall back to the GET page, which asks to confirm.
 */
export default function GoogleSignIn({ label = 'Sign in with Google' }: { label?: string }) {
  const { pathname } = useLocation()
  const action = `/accounts/google/login/?next=${encodeURIComponent(pathname)}`
  const token = csrfToken()

  if (!token) {
    return (
      <a className="google-signin" href={action}>
        {label}
      </a>
    )
  }

  return (
    <form method="post" action={action}>
      <input type="hidden" name="csrfmiddlewaretoken" value={token} />
      <button type="submit" className="google-signin">
        {label}
      </button>
    </form>
  )
}
