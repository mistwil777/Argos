import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import Dashboard from '@/pages/Dashboard'
import Browse from '@/pages/Browse'
import WebSearch from '@/pages/WebSearch'
import Feed from '@/pages/Feed'
import Assistant from '@/pages/Assistant'
import Sources from '@/pages/Sources'
import Settings from '@/pages/Settings'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/search" element={<WebSearch />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/sources" element={<Sources />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
