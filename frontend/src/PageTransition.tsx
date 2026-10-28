import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { Link, useNavigate, type To } from 'react-router-dom'
import './page-transition.css'
import { CDN } from './cdn'

// Keep these in sync with the durations in page-transition.css.
const IN_MS = 180  // fade in
const HOLD_MS = 2000 // loader screen is fully visible, route changes underneath
const OUT_MS = 220  // fade out
const LOAD_DELAY = 180 // progress bar starts a moment after mount
const LOAD_MS = 1000 // progress bar runs 0 -> 100%

const TIPS = [
  'Sign in with Google to post your scores.',
  'Every ranked run uses one ticket.',
  'Scores are verified on the server before they count.',
  'Think you can take the top spot?',
]

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const rnd = (n: number) => Math.floor(Math.random() * n)
const makeScramble = () => ({
  initials: Array.from({ length: 3 }, () =>
    Array.from({ length: 3 }, () => LETTERS[rnd(26)]).join(''),
  ),
  scores: Array.from({ length: 3 }, () => String(rnd(1_000_000)).padStart(6, '0')),
})

// DOM order is 2nd, 1st, 3rd so the winner sits in the middle.
const PODIUM = [
  { cls: 'lt-c2', place: '02', slot: 1 },
  { cls: 'lt-c1', place: '01', slot: 0 },
  { cls: 'lt-c3', place: '03', slot: 2 },
]

const SPRITES = ['ghost', 'pac', 'tetro', 'snake', 'bird'] as const

type Phase = 'idle' | 'in' | 'hold' | 'out'

function ScoresLoader() {
  const [pct, setPct] = useState(0)
  const [scramble, setScramble] = useState(makeScramble)
  const [tip] = useState(() => TIPS[rnd(TIPS.length)])

  useEffect(() => {
    const start = performance.now()
    let raf = 0

    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start - LOAD_DELAY) / LOAD_MS))
      setPct(100 * (1 - (1 - t) * (1 - t)))
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)

    const scrambler = window.setInterval(() => setScramble(makeScramble()), 70)

    return () => {
      cancelAnimationFrame(raf)
      window.clearInterval(scrambler)
    }
  }, [])

  const done = pct >= 100

  return (
    <>
      <div className="lt-stars" aria-hidden="true" />
      <div className="lt-floor" aria-hidden="true" />

      <div className="lt-top" aria-hidden="true">
        <span className="lt-brand">
          <img src={CDN.logo} alt="" width={24} height={24} />
          CODING CLUB
        </span>
        <span>CREDIT 01</span>
      </div>

      <div className="lt-core">
        <h2 className="lt-title">HIGH SCORES</h2>

        <div className="lt-podium" aria-hidden="true">
          {PODIUM.map(({ cls, place, slot }) => (
            <div key={place} className={`lt-col ${cls}`}>
              {place === '01' && <span className="lt-crown" />}
              <span className="lt-init">{scramble.initials[slot]}</span>
              <span className="lt-pts">{scramble.scores[slot]}</span>
              <div className="lt-pillar">{place}</div>
            </div>
          ))}
        </div>

        <div className="lt-progress">
          <div className="lt-meta">
            <span>{done ? 'READY!' : 'LOADING'}</span>
            <span className="lt-pct">{String(Math.floor(pct)).padStart(3, '0')}%</span>
          </div>
          <div className="lt-meter">
            <span className="lt-meter-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <p className="lt-tip">
          <b>TIP</b>
          {tip}
        </p>
      </div>

      <div className="lt-parade" aria-hidden="true">
        <div className="lt-pellets" />
        {SPRITES.map((name, i) => (
          <span
            key={name}
            className={`lt-sprite lt-${name}`}
            style={{ '--i': i } as CSSProperties}
          />
        ))}
      </div>

      <div className="lt-coin" aria-hidden="true">
        1 PLAYER READY
      </div>

      <div className="lt-scan" aria-hidden="true" />
      <div className="lt-vignette" aria-hidden="true" />
      <div className="lt-flash" aria-hidden="true" />
    </>
  )
}

const TransitionContext = createContext<{ go: (to: To) => void }>({ go: () => { } })

export const usePageTransition = () => useContext(TransitionContext)

export function PageTransitionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('idle')
  const busy = useRef(false)
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach(window.clearTimeout), [])

  const go = useCallback(
    (to: To) => {
      if (busy.current) return

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        navigate(to)
        return
      }

      busy.current = true
      setPhase('in')

      const at = (fn: () => void, ms: number) =>
        timers.current.push(window.setTimeout(fn, ms))

      at(() => {
        navigate(to)
        setPhase('hold')
      }, IN_MS)
      at(() => setPhase('out'), IN_MS + HOLD_MS)
      at(() => {
        setPhase('idle')
        busy.current = false
      }, IN_MS + HOLD_MS + OUT_MS)
    },
    [navigate],
  )

  return (
    <TransitionContext.Provider value={{ go }}>
      {children}
      {phase !== 'idle' && (
        <div
          className={`lt-overlay lt-${phase}`}
          role="status"
          aria-live="polite"
          aria-label="Loading high scores"
        >
          <div className="lt-screen">
            <ScoresLoader />
          </div>
        </div>
      )}
    </TransitionContext.Provider>
  )
}

/** Drop-in replacement for <Link> that plays the leaderboard transition. */
export function TransitionLink({ to, onClick, ...props }: ComponentProps<typeof Link>) {
  const { go } = usePageTransition()

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
        go(to)
      }}
    />
  )
}
