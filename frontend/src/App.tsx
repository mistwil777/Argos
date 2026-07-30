import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { VoiceProvider } from '@/context/VoiceContext'
import { CollectProvider } from '@/context/CollectContext'
import AppLayout from '@/components/layout/AppLayout'
import Assistant from '@/pages/Assistant'
import Sources from '@/pages/Sources'
import Dossiers from '@/pages/Dossiers'
import Settings from '@/pages/Settings'
import Library from '@/pages/Library'
import Briefing from '@/pages/Briefing'

export default function App() {
  return (
    <BrowserRouter>
      <VoiceProvider>
      <CollectProvider>
        <Routes>
          <Route element={<AppLayout />}>
            {/* Briefing Delta = page d'accueil */}
            <Route path="/" element={<Navigate to="/briefing" replace />} />
            <Route path="/briefing" element={<Briefing />} />
            <Route path="/assistant" element={<Assistant />} />
            <Route path="/sources" element={<Sources />} />
            <Route path="/dossiers" element={<Dossiers />} />
            <Route path="/library" element={<Library />} />
            <Route path="/settings" element={<Settings />} />
            {/* Redirects pour anciens bookmarks */}
            <Route path="/feed" element={<Navigate to="/briefing" replace />} />
            <Route path="/trends" element={<Navigate to="/briefing" replace />} />
            <Route path="/veille" element={<Navigate to="/briefing" replace />} />
            <Route path="/dashboard" element={<Navigate to="/briefing" replace />} />
          </Route>
        </Routes>
      </CollectProvider>
      </VoiceProvider>
    </BrowserRouter>
  )
}
