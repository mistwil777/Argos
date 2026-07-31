import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { VoiceProvider } from '@/context/VoiceContext'
import { CollectProvider } from '@/context/CollectContext'
import { AuthProvider } from '@/context/AuthContext'
import { ThemeProvider } from '@/context/ThemeContext'
import PrivateRoute from '@/components/auth/PrivateRoute'
import AppLayout from '@/components/layout/AppLayout'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import Veille from '@/pages/Veille'
import Briefing from '@/pages/Briefing'
import Librairie from '@/pages/Librairie'
import Reglages from '@/pages/Reglages'

export default function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
      <AuthProvider>
      <VoiceProvider>
      <CollectProvider>
        <Routes>
          {/* Routes publiques */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Routes protégées */}
          <Route element={<PrivateRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/briefing" replace />} />
              <Route path="/veille"    element={<Veille />} />
              <Route path="/briefing"  element={<Briefing />} />
              <Route path="/librairie" element={<Librairie />} />
              <Route path="/reglages"  element={<Reglages />} />

              {/* Redirects anciens chemins */}
              <Route path="/assistant"      element={<Navigate to="/briefing" replace />} />
              <Route path="/library"        element={<Navigate to="/librairie" replace />} />
              <Route path="/knowledge-graph" element={<Navigate to="/librairie" replace />} />
              <Route path="/settings"       element={<Navigate to="/reglages" replace />} />
              <Route path="/espaces"        element={<Navigate to="/reglages" replace />} />
              <Route path="/connexions"     element={<Navigate to="/reglages" replace />} />
              <Route path="/dossiers"       element={<Navigate to="/veille" replace />} />
              <Route path="/sources"        element={<Navigate to="/veille" replace />} />
              <Route path="/feed"           element={<Navigate to="/briefing" replace />} />
              <Route path="/trends"         element={<Navigate to="/briefing" replace />} />
              <Route path="/dashboard"      element={<Navigate to="/briefing" replace />} />
            </Route>
          </Route>
        </Routes>
      </CollectProvider>
      </VoiceProvider>
      </AuthProvider>
    </BrowserRouter>
    </ThemeProvider>
  )
}
