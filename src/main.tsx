import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import LoginPage from './LoginPage'
import { AuthProvider, useAuth } from './AuthContext'
import './styles.css'
import { loadSavedTheme } from './ThemePicker'

loadSavedTheme()

function Root() {
  const { user, loading } = useAuth()
  if (loading) return <div className="login-page"><div className="login-card" style={{ textAlign: 'center', color: '#94a3b8' }}>Cargando...</div></div>
  if (!user) return <LoginPage />
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </React.StrictMode>
)
