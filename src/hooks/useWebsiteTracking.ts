import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Generate or retrieve session ID
const getSessionId = (): string => {
  let sessionId = sessionStorage.getItem('tracking_session_id');
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('tracking_session_id', sessionId);
  }
  return sessionId;
};

// Parse UTM parameters from URL
const getUtmParams = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get('utm_source'),
    utm_medium: params.get('utm_medium'),
    utm_campaign: params.get('utm_campaign'),
    utm_term: params.get('utm_term'),
    utm_content: params.get('utm_content'),
  };
};

// Store UTM params in session for later use
const storeUtmParams = () => {
  const utmParams = getUtmParams();
  if (utmParams.utm_source || utmParams.utm_medium || utmParams.utm_campaign) {
    sessionStorage.setItem('first_utm_params', JSON.stringify(utmParams));
  }
};

export const getStoredUtmParams = () => {
  const stored = sessionStorage.getItem('first_utm_params');
  return stored ? JSON.parse(stored) : {};
};

interface TrackEventOptions {
  eventType: string;
  pagePath?: string;
  pageTitle?: string;
  contactId?: string;
  metadata?: Record<string, any>;
}

export const useWebsiteTracking = () => {
  const hasTrackedPageView = useRef(false);

  const trackEvent = useCallback(async (options: TrackEventOptions) => {
    const { eventType, pagePath, pageTitle, contactId, metadata } = options;
    const sessionId = getSessionId();
    const utmParams = getUtmParams();

    try {
      await supabase.from('website_events').insert({
        session_id: sessionId,
        event_type: eventType,
        page_path: pagePath || window.location.pathname,
        page_title: pageTitle || document.title,
        referrer: document.referrer || null,
        utm_source: utmParams.utm_source,
        utm_medium: utmParams.utm_medium,
        utm_campaign: utmParams.utm_campaign,
        utm_term: utmParams.utm_term,
        utm_content: utmParams.utm_content,
        user_agent: navigator.userAgent,
        screen_width: window.innerWidth,
        screen_height: window.innerHeight,
        contact_id: contactId || null,
        metadata: metadata || {},
      });
    } catch (error) {
      console.error('Error tracking event:', error);
    }
  }, []);

  const trackPageView = useCallback(() => {
    if (!hasTrackedPageView.current) {
      hasTrackedPageView.current = true;
      storeUtmParams();
      trackEvent({ eventType: 'page_view' });
    }
  }, [trackEvent]);

  const trackFormStart = useCallback((formName: string) => {
    trackEvent({ 
      eventType: 'form_start', 
      metadata: { form_name: formName } 
    });
  }, [trackEvent]);

  const trackFormSubmit = useCallback((formName: string, contactId?: string) => {
    trackEvent({ 
      eventType: 'form_submit', 
      contactId,
      metadata: { form_name: formName } 
    });
  }, [trackEvent]);

  const trackButtonClick = useCallback((buttonName: string) => {
    trackEvent({ 
      eventType: 'button_click', 
      metadata: { button_name: buttonName } 
    });
  }, [trackEvent]);

  const trackScroll = useCallback((scrollDepth: number) => {
    trackEvent({ 
      eventType: 'scroll', 
      metadata: { scroll_depth: scrollDepth } 
    });
  }, [trackEvent]);

  // Auto-track page view on mount
  useEffect(() => {
    trackPageView();
  }, [trackPageView]);

  return {
    trackEvent,
    trackPageView,
    trackFormStart,
    trackFormSubmit,
    trackButtonClick,
    trackScroll,
    getSessionId,
  };
};

export default useWebsiteTracking;
