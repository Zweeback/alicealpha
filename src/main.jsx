import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import NewsStudio from './news/NewsStudio.jsx';
import './styles.css';

const params = new URLSearchParams(globalThis.location?.search || '');
const Root = params.get('studio') === 'news' ? NewsStudio : App;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
