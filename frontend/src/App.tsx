import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

// Placeholder components for other pages
const Items = () => <div className="text-2xl font-bold">Items Page (Coming soon)</div>;
const Courses = () => <div className="text-2xl font-bold">Courses Page (Coming soon)</div>;
const RAG = () => <div className="text-2xl font-bold">RAG Assistant (Coming soon)</div>;
const Analytics = () => <div className="text-2xl font-bold">Analytics Page (Coming soon)</div>;
const HITL = () => <div className="text-2xl font-bold">HITL Manager (Coming soon)</div>;
const Admin = () => <div className="text-2xl font-bold">Admin Page (Coming soon)</div>;

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/items" element={<Items />} />
            <Route path="/courses" element={<Courses />} />
            <Route path="/rag" element={<RAG />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/hitl" element={<HITL />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;

