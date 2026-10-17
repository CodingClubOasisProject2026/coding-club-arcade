import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { type Me, fetchMe } from './api'
import { AuthContext } from './auth'

const SIGNED_OUT: Me = { authenticated: false }

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)

  const refresh = useCallback(async () => {
    setMe(await fetchMe().catch(() => SIGNED_OUT))
  }, [])

  useEffect(() => {
    fetchMe()
      .catch(() => SIGNED_OUT)
      .then(setMe)
  }, [])

  return <AuthContext.Provider value={{ me, refresh }}>{children}</AuthContext.Provider>
}
