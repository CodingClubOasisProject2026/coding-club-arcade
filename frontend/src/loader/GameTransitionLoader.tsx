import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import GameArtwork, { type ArtworkType } from '../games/GameArtwork'
import './game-transition-loader.css'

const DURATION = 3400
const KEYFRAMES = [
  [0, 0],
  [0.15, 12],
  [0.3, 28],
  [0.45, 41],
  [0.55, 55],
  [0.65, 68],
  [0.78, 80],
  [0.9, 93],
  [1, 100],
]

function preloadGame(path: string) {
  switch (path) {
    case '/minesweeper':
      return import('../games/minesweeper/Minesweeper')
    case '/wordle':
      return import('../games/wordle/WordlePage.jsx')
    case '/snake':
      return import('../games/snake/Snake')
    case '/tetris':
      return Promise.resolve()
    case '/pacman':
      return import('../games/pacman/Pacman')
    case '/flappy':
      return import('../games/flappy_bird/flappy')
    default:
      return Promise.reject(new Error(`Unknown game route: ${path}`))
  }
}

function getProgress(progress: number) {
  for (let index = 1; index < KEYFRAMES.length; index += 1) {
    const [endTime, endValue] = KEYFRAMES[index]
    if (progress <= endTime) {
      const [startTime, startValue] = KEYFRAMES[index - 1]
      const fraction = (progress - startTime) / (endTime - startTime)
      return Math.round(startValue + (endValue - startValue) * fraction)
    }
  }
  return 100
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
    let timer = 0
    const minimumDuration = new Promise<void>((resolve) => {
      timer = window.setTimeout(resolve, DURATION)
    })

    void Promise.all([preloadGame(destination), minimumDuration]).then(
      () => {
        if (!cancelled) {
          navigate(destination, { state: { fromGameTransition: true } })
        }
      },
      (error: unknown) => {
        console.error(`Unable to preload game at ${destination}`, error)
        void minimumDuration.then(() => {
          if (!cancelled) {
            navigate(destination, { state: { fromGameTransition: true } })
          }
        })
      },
    )

    const updateProgress = (now: number) => {
      const elapsed = Math.min((now - started) / DURATION, 1)
      setProgress(getProgress(elapsed))
      if (elapsed < 1) frame = requestAnimationFrame(updateProgress)
    }

    frame = requestAnimationFrame(updateProgress)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
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
