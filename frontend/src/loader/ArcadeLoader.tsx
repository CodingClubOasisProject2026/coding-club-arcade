import { useEffect, useLayoutEffect, useState } from 'react'
import { bootActive, holdBoot } from './boot'

// Same tips as the boot screen in index.html.
const LOADER_TIPS = [
  '<b>TIP</b> Sign in with Google to post your scores.',
  '<b>TIP</b> Every ranked run uses one ticket.',
  '<b>TIP</b> Scores are verified on the server before they count.',
  '<b>TIP</b> Most games pause with P.',
  '<b>TIP</b> Check the leaderboard to see who is on top.',
]

const SPRITES = ['pac', 'ghost', 'tetro', 'snake', 'mine', 'word', 'bird'] as const

/** Sprites, title and bar markup shared by the boot screen and route loader. */
function LoaderBody({ pct, tip }: { pct: number; tip: string }) {
  return (
    <>
      <div className="al-floor" aria-hidden="true" />
      <div className="al-core">
        <div className="al-brand">
          <img src="/logo.webp" alt="" width={36} height={36} />
          <span>CODING CLUB</span>
        </div>
        <div className="al-title">ARCADE</div>
        <div className="al-parade" aria-hidden="true">
          {SPRITES.map((name, i) => (
            <span key={name} className={`al-sprite al-${name}`} style={{ '--i': i } as React.CSSProperties}>
              <i>{name === 'word' ? 'W' : null}</i>
            </span>
          ))}
        </div>
        <div className="al-progress">
          <div className="al-meta">
            <span className="al-meta-label">LOADING</span>
            <span className="al-pct">{String(Math.floor(pct)).padStart(3, '0')}%</span>
          </div>
          <div className="al-bar">
            <span className="al-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <p className="al-tip" dangerouslySetInnerHTML={{ __html: tip }} />
      </div>
      <div className="al-coin" aria-hidden="true">INSERT COIN</div>
    </>
  )
}

/**
 * Suspense fallback for lazy routes. If the boot screen is still up it renders
 * nothing and keeps the boot screen alive instead, so the user sees one loader.
 */
export default function ArcadeLoader() {
  const [underBoot] = useState(bootActive)
  const [pct, setPct] = useState(0)
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * LOADER_TIPS.length))

  useLayoutEffect(() => (underBoot ? holdBoot() : undefined), [underBoot])

  useEffect(() => {
    if (underBoot) return
    // Eases toward 92% and waits there; the route replaces this loader when ready.
    const bar = window.setInterval(() => setPct((p) => (p < 92 ? p + Math.max(0.6, (92 - p) * 0.09) : p)), 80)
    const tips = window.setInterval(() => setTipIndex((i) => (i + 1) % LOADER_TIPS.length), 2200)
    return () => {
      window.clearInterval(bar)
      window.clearInterval(tips)
    }
  }, [underBoot])

  if (underBoot) return null

  return (
    <div className="al-screen is-route" role="status" aria-live="polite" aria-label="Loading">
      <LoaderBody pct={pct} tip={LOADER_TIPS[tipIndex]} />
    </div>
  )
}
