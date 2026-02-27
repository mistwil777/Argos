import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import Items from './pages/Items';
import Courses from './pages/Courses';
import RAG from './pages/RAG';
import Analytics from './pages/Analytics';
import HITL from './pages/HITL';
import Admin from './pages/Admin';
import Sources from './pages/Sources';
import Guide from './pages/Guide';
import TestPage from './pages/TestPage';
import { Workspaces } from './pages/Workspaces';
import { useToast } from './hooks/useToast';
import { ToastContainer } from './components/ui/Toast';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

function App() {
  const { toasts, addToast, removeToast } = useToast();

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/test" element={<TestPage />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/workspaces" element={<Workspaces />} />
            <Route path="/items" element={<Items addToast={addToast} removeToast={removeToast} />} />
            <Route path="/courses" element={<Courses addToast={addToast} removeToast={removeToast} />} />
            <Route path="/rag" element={<RAG addToast={addToast} />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/hitl" element={<HITL addToast={addToast} />} />
            <Route path="/sources" element={<Sources addToast={addToast} />} />
            <Route path="/guide" element={<Guide />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
        </Layout>
        <ToastContainer toasts={toasts} onClose={removeToast} />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;

