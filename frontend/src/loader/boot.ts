// Controls the boot screen that index.html paints before the JS bundle runs.
// The screen stays up until every "hold" is released, then plays its exit animation.
// main.tsx takes one hold for the first render; a lazy route that is still loading
// takes another, so the boot screen never hands off to a second loader.

type BootApi = { done: () => void }

declare global {
  interface Window {
    __arcadeBoot?: BootApi
  }
}

let holds = 0
let finished = false

export function bootActive() {
  return !finished && Boolean(window.__arcadeBoot)
}

export function holdBoot(): () => void {
  if (!bootActive()) return () => {}
  holds += 1
  let released = false
  return () => {
    if (released) return
    released = true
    holds -= 1
    // Wait a frame so a route that suspends right after this release can take a new hold.
    requestAnimationFrame(() => {
      if (holds === 0 && !finished) {
        finished = true
        window.__arcadeBoot?.done()
      }
    })
  }
}
