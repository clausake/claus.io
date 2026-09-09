import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ToastProvider} from './components/ui/Toast';
import {LazyMotion} from 'motion/react';
import './index.css';

// Mute specific React console warnings that are noisy and outside our control (like Recharts defaultProps)
const originalConsoleError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && /defaultProps will be removed/.test(args[0])) {
    return;
  }
  originalConsoleError(...args);
};

// Les composants de l'app utilisent le composant `m` (variante legere de
// `motion`, sans les features embarquees). Sans ce fournisseur, un element
// `initial={{ opacity: 0 }}` reste fige a 0 pour toujours : le build reste vert
// et l'utilisateur voit un ecran partiellement vide. C'est le defaut silencieux
// que verrouille test/e2e/motion-animation.spec.ts, mesure sur le dist reel.
//
// Le loader est une fonction (et non la constante) : c'est ce qui fait de la
// charge des features un chunk ASYNCHRONE et garde le bundle d'entree leger.
const loadFeatures = () => import('./motion-features').then((m) => m.default);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LazyMotion features={loadFeatures}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </LazyMotion>
  </StrictMode>,
);
