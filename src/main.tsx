import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ToastProvider} from './components/ui/Toast';
import './index.css';

// Mute specific React console warnings that are noisy and outside our control (like Recharts defaultProps)
const originalConsoleError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && /defaultProps will be removed/.test(args[0])) {
    return;
  }
  originalConsoleError(...args);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
