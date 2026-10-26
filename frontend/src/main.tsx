import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { holdBoot } from './loader/boot'

// Keep the boot screen up until the first render has painted and the pixel font is in
// (capped so a slow font CDN never blocks the arcade).
const releaseBoot = holdBoot()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

const fontsReady = document.fonts?.ready ?? Promise.resolve()
const timeout = new Promise((resolve) => setTimeout(resolve, 2500))
requestAnimationFrame(() => {
  void Promise.race([fontsReady, timeout]).then(releaseBoot)
})
