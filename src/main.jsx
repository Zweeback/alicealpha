import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import '@fontsource-variable/instrument-sans/wght.css';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import './styles.css';

// Nebenansichten laden nur, wenn sie per URL angefordert werden.
const NewsStudio = lazy(() => import('./news/NewsStudio.jsx'));
const VRMViewer = lazy(() => import('./viewer/VRMViewer.jsx'));
const VRMComponentsApp = lazy(() => import('./viewer/VRMComponentsApp.jsx'));

const params = new URLSearchParams(globalThis.location?.search || '');
const Root = params.get('studio') === 'vrm-components'
  ? VRMComponentsApp
  : params.get('viewer') === 'vrm'
    ? VRMViewer
    : params.get('studio') === 'news' ? NewsStudio : App;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      <Root />
    </Suspense>
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
