import { useCallback, type PointerEvent } from 'react'

interface DPadProps {
  onDirection: (dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => void
  onPause?: () => void
  isPlaying?: boolean
  isPaused?: boolean
}

export default function DPad({ onDirection, onPause, isPlaying, isPaused }: DPadProps) {
  const handlePress = useCallback(
    (dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      onDirection(dir)
    },
    [onDirection]
  )

  const handleCenter = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (onPause) onPause()
    },
    [onPause]
  )

  return (
    <div className="snake-dpad" role="group" aria-label="Game Controls">
      <span className="snake-dpad-corner" />
      <button
        type="button"
        className="snake-dpad-btn btn-up"
        onPointerDown={handlePress('UP')}
        aria-label="Move Up"
      >
        <span className="snake-dpad-arrow">▲</span>
      </button>
      <span className="snake-dpad-corner" />

      <button
        type="button"
        className="snake-dpad-btn btn-left"
        onPointerDown={handlePress('LEFT')}
        aria-label="Move Left"
      >
        <span className="snake-dpad-arrow">◀</span>
      </button>

      <button
        type="button"
        className={`snake-dpad-center ${isPlaying ? 'is-playing' : ''}`}
        onPointerDown={handleCenter}
        aria-label={isPaused ? 'Resume Game' : isPlaying ? 'Pause Game' : 'Center Control'}
      >
        <span className="snake-dpad-center-icon">
          {isPlaying ? '⏸' : isPaused ? '▶' : '✦'}
        </span>
      </button>

      <button
        type="button"
        className="snake-dpad-btn btn-right"
        onPointerDown={handlePress('RIGHT')}
        aria-label="Move Right"
      >
        <span className="snake-dpad-arrow">▶</span>
      </button>

      <span className="snake-dpad-corner" />
      <button
        type="button"
        className="snake-dpad-btn btn-down"
        onPointerDown={handlePress('DOWN')}
        aria-label="Move Down"
      >
        <span className="snake-dpad-arrow">▼</span>
      </button>
      <span className="snake-dpad-corner" />
    </div>
  )
}
