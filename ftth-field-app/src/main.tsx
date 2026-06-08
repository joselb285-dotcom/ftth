import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import 'leaflet/dist/leaflet.css'
import App from './App'
import { AuthProvider } from './AuthContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
)
