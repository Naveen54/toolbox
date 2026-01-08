import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from './analytics';

export const withPageView = <P extends object>(
  Wrapped: React.ComponentType<P>,
  pageTitle?: string,
) => {
  const WithPageView: React.FC<P> = (props) => {
    const location = useLocation();

    useEffect(() => {
      trackPageView(location.pathname + location.search, pageTitle);
    }, [location.pathname, location.search]);

    return <Wrapped {...props} />;
  };

  const wrappedName = Wrapped.displayName || Wrapped.name || 'Component';
  WithPageView.displayName = `withPageView(${wrappedName})`;

  return WithPageView;
};
