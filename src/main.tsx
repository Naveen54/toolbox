import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.scss';
import { initAnalytics } from './utils/analytics';
import { initClarity, setClarityConsent } from './utils/clarity';
import {
  getAnalyticsConsent,
  subscribeToAnalyticsConsent,
} from './utils/consent';

if (getAnalyticsConsent() === 'granted') {
  initAnalytics();
  initClarity();
}

subscribeToAnalyticsConsent((consent) => {
  setClarityConsent(consent);
  if (consent === 'granted') {
    initAnalytics();
    initClarity();
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
