import React from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LoadingScreen, ErrorScreen } from './components/Screens'
import Dashboard from './components/Dashboard'

function AppContent() {
  const { loading, error, isAuthenticated } = useAuth()
  if (loading) return <LoadingScreen />
  if (error) return <ErrorScreen error={error} />
  if (!isAuthenticated) return <ErrorScreen error="Not authenticated. Please install PipelinePulse on this sub-account." />
  return <Dashboard />
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
