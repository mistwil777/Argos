// Minimal test app to diagnose rendering issues
import { BrowserRouter } from 'react-router-dom';

console.log('🧪 App.test.tsx loaded');

function TestApp() {
  console.log('🧪 TestApp rendering');
  
  return (
    <BrowserRouter>
      <div style={{ 
        padding: '20px', 
        fontFamily: 'Arial, sans-serif',
        backgroundColor: '#f0f0f0',
        minHeight: '100vh'
      }}>
        <h1 style={{ color: '#333' }}>✅ React is Working!</h1>
        <p>If you see this, React is rendering correctly.</p>
        <ul>
          <li>Argos Frontend</li>
          <li>Vite Dev Server: Running</li>
          <li>React Router: Loaded</li>
        </ul>
      </div>
    </BrowserRouter>
  );
}

export default TestApp;
