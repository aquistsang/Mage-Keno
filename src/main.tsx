import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { isEmbedded } from './utils/bridge';
import './index.css';

if (isEmbedded()) {
  document.documentElement.classList.add('is-embedded');
  document.getElementById('root')?.classList.add('is-embedded');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
