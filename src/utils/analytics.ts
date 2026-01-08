import ReactGA from 'react-ga4';

let gaInitialized = false;
const USER_ID_STORAGE_KEY = 'devtoolbox_user_id';

const generateUserId = () => {
  // Prefer crypto.randomUUID when available.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback: reasonably unique, not cryptographically strong.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const getOrCreateUserId = () => {
  try {
    const existing = localStorage.getItem(USER_ID_STORAGE_KEY);
    if (existing) return existing;

    const next = generateUserId();
    localStorage.setItem(USER_ID_STORAGE_KEY, next);
    return next;
  } catch {
    // If storage is blocked, still return a per-session id.
    return generateUserId();
  }
};

export const getUserId = () => {
  try {
    return localStorage.getItem(USER_ID_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const initAnalytics = () => {
  if (gaInitialized) return;

  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
  if (!measurementId) return;

  ReactGA.initialize(measurementId);

  // Attach a stable user id so the same browser is recognized across sessions.
  // (This is not the GA4 "client_id"; it's an explicit user_id you control.)
  const userId = getOrCreateUserId();
  ReactGA.set({ userId });

  gaInitialized = true;
};

export const trackPageView = (path: string, title?: string) => {
  if (!gaInitialized) return;

  // Prefer GA4-native page_view event with standard params.
  // In dev, enable DebugView by setting debug_mode.
  ReactGA.event('page_view', {
    page_location: window.location.origin + path,
    page_path: path,
    page_title: title,
    debug_mode: import.meta.env.DEV ? true : undefined,
  });
};

type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;

export const trackEvent = (eventName: string, params?: AnalyticsParams) => {
  if (!gaInitialized) return;

  ReactGA.event(eventName, {
    ...params,
    debug_mode: import.meta.env.DEV ? true : undefined,
  });
};
