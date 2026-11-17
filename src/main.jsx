import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import AliceStage from './stage/AliceStage.jsx';

// Start page is Alice only. The older screens stay reachable for development
// via query parameters and are code-split so they do not slow down the start.
const App = lazy(() => import('./App.jsx'));
const NewsStudio = lazy(() => import('./news/NewsStudio.jsx'));
const VRMViewer = lazy(() => import('./viewer/VRMViewer.jsx'));
const VRMComponentsApp = lazy(() => import('./viewer/VRMComponentsApp.jsx'));
const LegacyStyles = lazy(() => import('./styles.css').then(() => ({ default: () => null })));

const params = new URLSearchParams(globalThis.location?.search || '');
const Legacy = params.get('studio') === 'vrm-components'
  ? VRMComponentsApp
  : params.get('viewer') === 'vrm'
    ? VRMViewer
    : params.get('studio') === 'news' ? NewsStudio
      : params.get('app') === 'full' ? App : null;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {Legacy
      ? <Suspense fallback={null}><LegacyStyles /><Legacy /></Suspense>
      : <AliceStage />}
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
