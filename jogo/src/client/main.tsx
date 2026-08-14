import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './estilos.css';

const raiz = document.getElementById('root');
if (!raiz) throw new Error('index.html sem #root');

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
