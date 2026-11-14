import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/index.css' // estilos de `base` (INICIO)
import './legacy.css' // pantallas internas todavía sin migrar (acotado a .legacy)
import App from './App.jsx'
import { initScrollFade } from './lib/scrollFade'

initScrollFade()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
