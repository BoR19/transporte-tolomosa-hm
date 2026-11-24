import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js', { updateViaCache: 'none' })
      .then((reg) => reg.update())
      .catch(() => {
        // Service worker registration failed silently
      });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
