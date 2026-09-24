import { useEffect, useState } from 'react';
import CookieConsent from 'react-cookie-consent';
import {
  getAnalyticsConsent,
  setAnalyticsConsent,
  subscribeToAnalyticsConsent,
  type AnalyticsConsent,
} from '../utils/consent';

export const AnalyticsConsent = () => {
  const [consent, setConsent] = useState<AnalyticsConsent | null>(
    getAnalyticsConsent(),
  );

  useEffect(() => subscribeToAnalyticsConsent(setConsent), []);

  if (consent) return null;

  return (
    <CookieConsent
      cookieName="devtoolbox-analytics-consent-banner"
      enableDeclineButton
      buttonText="Accept analytics"
      declineButtonText="Reject"
      onAccept={() => setAnalyticsConsent('granted')}
      onDecline={() => setAnalyticsConsent('denied')}
      style={{ background: '#1f2937' }}
      buttonStyle={{ color: '#111827', background: '#f9fafb' }}
      declineButtonStyle={{ color: '#f9fafb', background: '#374151' }}
    >
      We use Google Analytics and Microsoft Clarity to understand how DevToolbox
      is used.
    </CookieConsent>
  );
};
