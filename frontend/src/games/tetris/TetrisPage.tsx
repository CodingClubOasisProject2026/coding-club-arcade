import { useEffect } from 'react'
import { useHubTransition } from '../../loader/HubTransition'

export default function TetrisPage() {
  const { transitionToHub } = useHubTransition()

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'arcade-navigate-hub') {
        transitionToHub()
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [transitionToHub])

  return (
    <iframe
      title="Blockbind"
      src="/src/games/tetris/index.html"
      className="tetris-frame"
    />
  )
}
