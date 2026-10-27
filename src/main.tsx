import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './styles/dashboard-theme.css'
import './styles/dashboard-modules.css'
import { ProteccionErrores } from './components/ProteccionErrores'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProteccionErrores nombre="app">
      <App />
    </ProteccionErrores>
  </StrictMode>,
)
