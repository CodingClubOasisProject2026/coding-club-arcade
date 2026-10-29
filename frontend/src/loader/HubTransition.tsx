import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { Link, useNavigate, type To } from 'react-router-dom'
import { CDN } from '../cdn'
import './hub-transition.css'

const IN_MS = 200
const HOLD_MS = 90
const OUT_MS = 220

type Phase = 'idle' | 'in' | 'out'

type HubTransitionContextType = {
  transitionToHub: (to?: To) => void
  isTransitioning: boolean
}

const HubTransitionContext = createContext<HubTransitionContextType>({
  transitionToHub: () => {},
  isTransitioning: false,
})

export const useHubTransition = () => useContext(HubTransitionContext)

export function HubTransitionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('idle')
  const busy = useRef(false)
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach(window.clearTimeout), [])

  const transitionToHub = useCallback(
    (to: To = '/') => {
      if (busy.current) return

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        navigate(to)
        return
      }

      busy.current = true
      setPhase('in')

      const at = (fn: () => void, ms: number) => {
        timers.current.push(window.setTimeout(fn, ms))
      }

      at(() => {
        navigate(to)
        setPhase('out')
      }, IN_MS + HOLD_MS)

      at(() => {
        setPhase('idle')
        busy.current = false
      }, IN_MS + HOLD_MS + OUT_MS)
    },
    [navigate],
  )

  return (
    <HubTransitionContext.Provider
      value={{ transitionToHub, isTransitioning: phase !== 'idle' }}
    >
      {children}
      {phase !== 'idle' && (
        <div
          className={`hub-transition-overlay is-${phase}`}
          role="status"
          aria-live="polite"
          aria-label="Returning to arcade"
        >
          <div className="hub-transition-scanlines" aria-hidden="true" />
          <div className="hub-transition-vignette" aria-hidden="true" />
          <div className="hub-transition-content">
            <div className="hub-transition-emblem">
              <img src={CDN.logo} alt="Coding Club" />
            </div>
            <h2 className="hub-transition-title">CODING CLUB ARCADE</h2>
            <p className="hub-transition-status">
              RETURNING TO HUB
              <span className="hub-transition-cursor" aria-hidden="true" />
            </p>
          </div>
        </div>
      )}
    </HubTransitionContext.Provider>
  )
}

export function HubLink({
  to = '/',
  onClick,
  ...props
}: ComponentProps<typeof Link>) {
  const { transitionToHub } = useHubTransition()

  return (
    <Link
      to={to}
      {...props}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event)
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return
        }
        event.preventDefault()
        transitionToHub(to)
      }}
    />
  )
}
