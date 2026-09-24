import type { AnalyticsConsent } from './consent';

type Clarity = {
  (...args: unknown[]): void;
  q?: unknown[][];
};

declare global {
  interface Window {
    clarity?: Clarity;
  }
}

let clarityInitialized = false;

const getClarity = () => window.clarity;

export const setClarityConsent = (consent: AnalyticsConsent) => {
  getClarity()?.('consentv2', {
    ad_Storage: consent === 'granted' ? 'granted' : 'denied',
    analytics_Storage: consent === 'granted' ? 'granted' : 'denied',
  });
};

export const initClarity = () => {
  if (clarityInitialized) return;

  const projectId = import.meta.env.VITE_CLARITY_PROJECT_ID as string | undefined;
  if (!projectId) return;

  const clarity = ((...args: unknown[]) => {
    (clarity.q ||= []).push(args);
  }) as Clarity;
  window.clarity = clarity;
  clarityInitialized = true;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${encodeURIComponent(projectId)}`;
  document.head.appendChild(script);
  setClarityConsent('granted');
};

export const trackClarityEvent = (eventName: string) => {
  if (!clarityInitialized) return;
  getClarity()?.('event', eventName);
};
