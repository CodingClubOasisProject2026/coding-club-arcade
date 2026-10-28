import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import GameArtwork, { type ArtworkType } from '../games/GameArtwork'
import { CDN, SNAKE_SPRITES } from '../cdn'
import './game-transition-loader.css'

// Stop waiting on images and fonts after this long; the game still works without them.
const ASSET_TIMEOUT_MS = 8000
// How long the bar sits at 100% before switching, so the fill is visible.
const COMPLETE_HOLD_MS = 150
const TETRIS_PAGE = '/src/games/tetris/index.html'

function loadImage(src: string) {
  return new Promise<void>((resolve) => {
    const image = new Image()
    image.onload = () => void image.decode().catch(() => {}).finally(resolve)
    image.onerror = () => resolve()
    image.src = src
  })
}

// Each game's CSS declares its own web fonts, so load them once that CSS is in.
const GAME_FONTS: Record<string, string[]> = {
  '/minesweeper': ['Press Start 2P'],
  '/wordle': ['Press Start 2P', 'IBM Plex Mono'],
  '/snake': ['Press Start 2P'],
  '/tetris': [],
  '/pacman': ['Press Start 2P', 'Pixelify Sans'],
  '/flappy': ['Press Start 2P'],
}

function loadFonts(path: string, code: Promise<unknown>) {
  if (!('fonts' in document)) return Promise.resolve()
  return code
    .then(() =>
      Promise.all(
        (GAME_FONTS[path] ?? []).map((family) => document.fonts.load(`16px "${family}"`, 'AZaz09')),
      ),
    )
    .then(() => undefined, () => undefined)
}

// Tetris runs in an iframe, so warm the iframe page and the files it references.
async function loadTetrisPage() {
  const html = await fetch(TETRIS_PAGE).then((response) => response.text())
  const page = new DOMParser().parseFromString(html, 'text/html')
  const files = [...page.querySelectorAll('script[src], link[rel="stylesheet"][href], link[rel="modulepreload"][href]')]
    .map((element) => element.getAttribute('src') ?? element.getAttribute('href'))
    .filter((url): url is string => Boolean(url))
  await Promise.all(files.map((url) => fetch(new URL(url, location.origin + TETRIS_PAGE)).then((r) => r.blob())))
}

// The game's code (with its CSS) must load before navigating. Images and fonts
// are best-effort: they're awaited, but never block past ASSET_TIMEOUT_MS.
function gameTasks(path: string): { code: Promise<unknown>; assets: Promise<void>[] } {
  const withFonts = (code: Promise<unknown>, images: string[] = []) => ({
    code,
    assets: [loadFonts(path, code), ...images.map(loadImage)],
  })
  switch (path) {
    case '/minesweeper':
      return withFonts(import('../games/minesweeper/Minesweeper'))
    case '/wordle':
      return withFonts(import('../games/wordle/WordlePage.jsx'))
    case '/snake':
      return withFonts(import('../games/snake/Snake'), Object.values(SNAKE_SPRITES))
    case '/tetris':
      return withFonts(loadTetrisPage(), [CDN.tetrisBackground, CDN.tetrisBomb])
    case '/pacman':
      return withFonts(import('../games/pacman/Pacman'), [CDN.pacmanBackground])
    case '/flappy':
      return withFonts(import('../games/flappy_bird/flappy'), [CDN.flappyBackground])
    default:
      return { code: Promise.reject(new Error(`Unknown game route: ${path}`)), assets: [] }
  }
}

type Props = {
  name: string
  artwork: ArtworkType
  color: string
  destination: string
}

export default function GameTransitionLoader({
  name,
  artwork,
  color,
  destination,
}: Props) {
  const navigate = useNavigate()
  const [progress, setProgress] = useState(0)
  const style = { '--game': color } as CSSProperties

  useEffect(() => {
    const started = performance.now()
    let frame = 0
    let cancelled = false
    let holdTimer = 0
    let assetTimer = 0
    let done = 0
    let finished = false

    const { code, assets } = gameTasks(destination)
    const total = assets.length + 1
    const count = <T,>(task: Promise<T>) =>
      task.finally(() => {
        done += 1
      })

    const assetsReady = Promise.race([
      Promise.all(assets.map(count)),
      new Promise<void>((resolve) => {
        assetTimer = window.setTimeout(resolve, ASSET_TIMEOUT_MS)
      }),
    ])

    const go = () => {
      if (cancelled) return
      finished = true
      setProgress(100)
      holdTimer = window.setTimeout(() => {
        if (!cancelled) navigate(destination, { state: { fromGameTransition: true } })
      }, COMPLETE_HOLD_MS)
    }

    void Promise.all([count(code), assetsReady]).then(go, (error: unknown) => {
      // Let the game page show its own error instead of hanging here.
      console.error(`Unable to preload game at ${destination}`, error)
      go()
    })

    // The bar follows finished tasks, plus a slow creep so it never looks stuck
    // while one large file downloads. It only reaches 100% once everything is ready.
    const updateProgress = (now: number) => {
      if (cancelled || finished) return
      const creep = 90 * (1 - Math.exp(-(now - started) / 1500))
      const real = (done / total) * 95
      setProgress((previous) => Math.max(previous, Math.round(Math.min(95, Math.max(real, creep)))))
      frame = requestAnimationFrame(updateProgress)
    }

    frame = requestAnimationFrame(updateProgress)
    return () => {
      cancelled = true
      window.clearTimeout(holdTimer)
      window.clearTimeout(assetTimer)
      cancelAnimationFrame(frame)
    }
  }, [destination, navigate])

  return (
    <main className="game-transition" style={style} role="status" aria-live="polite">
      <div className="game-transition-stage">
        <div className="game-transition-crt">
          <div className="game-transition-screen">
            <div className="game-transition-stars" aria-hidden="true">
              {Array.from({ length: 28 }, (_, index) => (
                <span
                  key={index}
                  style={{
                    left: `${(index * 61 + 7) % 97}%`,
                    top: `${(index * 37 + 13) % 97}%`,
                    animationDelay: `${index * -0.17}s`,
                  }}
                />
              ))}
            </div>

            <div className="game-transition-logo">
              <span className="game-transition-eyebrow">★ ARCADE UNIVERSE ★</span>
              <h1>{name}</h1>
            </div>

            <div className="game-transition-art" aria-hidden="true">
              <GameArtwork type={artwork} />
            </div>

            <div className="game-transition-loading">
              <span className="game-transition-label">LOADING<span className="game-transition-dots" /></span>
              <div
                className="game-transition-track"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Loading ${name}`}
              >
                <div className="game-transition-fill" style={{ width: `${progress}%` }} />
              </div>
              <span className="game-transition-percent">{progress}%</span>
            </div>

            <span className="game-transition-coin">— INSERT COIN —</span>
          </div>

          <div className="game-transition-leds" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <span key={index} />
            ))}
          </div>
        </div>
        <div className="game-transition-stand" aria-hidden="true">
          <span />
          <span />
        </div>
      </div>
    </main>
  )
}
