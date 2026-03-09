import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/animations.css'
import './cockpit-theme.css'
import { CockpitApp } from './cockpit/CockpitApp.tsx'

// Apply saved theme before first paint to avoid flash
try {
  const prefs = JSON.parse(localStorage.getItem('userPrefs') || '{}');
  document.documentElement.setAttribute('data-theme', prefs.theme || 'sombre');
} catch { /* ignore */ }

console.log('🚀 Main.tsx loaded');

const rootElement = document.getElementById('root');
console.log('🎯 Root element:', rootElement);

if (!rootElement) {
  console.error('❌ Root element not found!');
} else {
  console.log('✅ Creating React root...');
  try {
    createRoot(rootElement).render(
      <StrictMode>
        <CockpitApp />
      </StrictMode>,
    );
    console.log('✅ React app rendered');
  } catch (error) {
    console.error('❌ Error rendering React app:', error);
  }
}
