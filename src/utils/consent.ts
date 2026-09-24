export type AnalyticsConsent = 'granted' | 'denied';

const CONSENT_STORAGE_KEY = 'devtoolbox_analytics_consent';
const CONSENT_EVENT = 'devtoolbox:analytics-consent';

export const getAnalyticsConsent = (): AnalyticsConsent | null => {
  try {
    const value = localStorage.getItem(CONSENT_STORAGE_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
};

export const setAnalyticsConsent = (consent: AnalyticsConsent) => {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, consent);
  } catch {
    // Consent still applies for this page even when storage is unavailable.
  }

  window.dispatchEvent(new CustomEvent<AnalyticsConsent>(CONSENT_EVENT, { detail: consent }));
};

export const subscribeToAnalyticsConsent = (
  listener: (consent: AnalyticsConsent) => void,
) => {
  const handleConsent = (event: Event) => {
    listener((event as CustomEvent<AnalyticsConsent>).detail);
  };

  window.addEventListener(CONSENT_EVENT, handleConsent);
  return () => window.removeEventListener(CONSENT_EVENT, handleConsent);
};
