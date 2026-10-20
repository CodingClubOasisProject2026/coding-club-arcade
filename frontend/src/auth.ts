import { createContext, useContext } from 'react'
import type { Me } from './api'

export type AuthState = {
  /** null while the first /me/ request is in flight */
  me: Me | null
  refresh: () => Promise<void>
}

export const AuthContext = createContext<AuthState>({ me: null, refresh: async () => {} })

export function useAuth() {
  return useContext(AuthContext)
}
