import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LoadingScreen, ErrorScreen } from './components/Screens'
import Dashboard from './components/Dashboard'
import DealHub from './pages/DealHub'

function AppContent() {
  const { loading, error, isAuthenticated } = useAuth()
  if (loading) return <LoadingScreen />
  if (error) return <ErrorScreen error={error} />
  if (!isAuthenticated)
    return <ErrorScreen error="Not authenticated. Please install PipelinePulse on this sub-account." />
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/deals/:id" element={<DealHub />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  )
}
