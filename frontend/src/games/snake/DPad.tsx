import type { MouseEvent, TouchEvent } from 'react'

interface DPadProps {
  onDirection: (dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => void
}

export default function DPad({ onDirection }: DPadProps) {
  const press = (dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => (e: MouseEvent | TouchEvent) => {
    e.preventDefault()
    onDirection(dir)
  }

  return (
    <div className="snake-dpad">
      <span />
      <button type="button" className="snake-dpad-btn" onPointerDown={press('UP')}>
        ▲
      </button>
      <span />
      <button type="button" className="snake-dpad-btn" onPointerDown={press('LEFT')}>
        ◀
      </button>
      <span />
      <button type="button" className="snake-dpad-btn" onPointerDown={press('RIGHT')}>
        ▶
      </button>
      <span />
      <button type="button" className="snake-dpad-btn" onPointerDown={press('DOWN')}>
        ▼
      </button>
      <span />
    </div>
  )
}
