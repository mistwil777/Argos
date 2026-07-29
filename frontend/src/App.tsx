import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { VoiceProvider } from '@/context/VoiceContext'
import AppLayout from '@/components/layout/AppLayout'
import Dashboard from '@/pages/Dashboard'
import Feed from '@/pages/Feed'
import Assistant from '@/pages/Assistant'
import Sources from '@/pages/Sources'
import Settings from '@/pages/Settings'
import Library from '@/pages/Library'
import Briefing from '@/pages/Briefing'
import Trends from '@/pages/Trends'
import Veille from '@/pages/Veille'

export default function App() {
  return (
    <BrowserRouter>
      <VoiceProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/browse" element={<Navigate to="/feed" replace />} />
            <Route path="/search" element={<Navigate to="/feed" replace />} />
            <Route path="/feed" element={<Feed />} />
            <Route path="/assistant" element={<Assistant />} />
            <Route path="/veille" element={<Veille />} />
            <Route path="/sources" element={<Sources />} />
            <Route path="/library" element={<Library />} />
            <Route path="/briefing" element={<Briefing />} />
            <Route path="/trends" element={<Trends />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </VoiceProvider>
    </BrowserRouter>
  )
}
