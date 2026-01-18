/**
 * Bot Protection Hook
 * 
 * Implements multiple bot detection mechanisms for contact forms:
 * 1. Honeypot fields - Hidden fields that bots fill but humans don't see
 * 2. Timing analysis - Forms submitted too quickly are likely bots
 * 3. Rate limiting - Prevents spam by limiting submissions per time window
 */

import { useState, useEffect, useCallback } from 'react';

const RATE_LIMIT_KEY = 'contact_form_submissions';
const MAX_SUBMISSIONS_PER_HOUR = 5;
const MIN_SUBMISSION_TIME_MS = 3000; // 3 seconds minimum to fill form

interface RateLimitData {
  timestamps: number[];
}

interface BotProtectionState {
  honeypotValue: string;
  formLoadTime: number;
  isBlocked: boolean;
  blockReason: string | null;
}

interface BotProtectionResult {
  // Honeypot field props - render this hidden input in forms
  honeypotProps: {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    name: string;
    tabIndex: number;
    autoComplete: string;
    style: React.CSSProperties;
    'aria-hidden': boolean;
  };
  // Call before form submission to validate
  validateSubmission: () => { isValid: boolean; error: string | null };
  // Record successful submission for rate limiting
  recordSubmission: () => void;
  // Current blocking state
  isBlocked: boolean;
  blockReason: string | null;
}

export function useBotProtection(): BotProtectionResult {
  const [state, setState] = useState<BotProtectionState>({
    honeypotValue: '',
    formLoadTime: Date.now(),
    isBlocked: false,
    blockReason: null,
  });

  // Check rate limit on mount
  useEffect(() => {
    const checkRateLimit = () => {
      try {
        const stored = localStorage.getItem(RATE_LIMIT_KEY);
        if (!stored) return;

        const data: RateLimitData = JSON.parse(stored);
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        const recentSubmissions = data.timestamps.filter(t => t > oneHourAgo);

        if (recentSubmissions.length >= MAX_SUBMISSIONS_PER_HOUR) {
          setState(prev => ({
            ...prev,
            isBlocked: true,
            blockReason: 'Has alcanzado el límite de envíos. Por favor, inténtalo más tarde.',
          }));
        }
      } catch {
        // Ignore localStorage errors
      }
    };

    checkRateLimit();
    // Reset form load time when component mounts
    setState(prev => ({ ...prev, formLoadTime: Date.now() }));
  }, []);

  const handleHoneypotChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setState(prev => ({ ...prev, honeypotValue: e.target.value }));
  }, []);

  const validateSubmission = useCallback((): { isValid: boolean; error: string | null } => {
    // Check honeypot - bots often fill hidden fields
    if (state.honeypotValue.trim() !== '') {
      console.warn('[Bot Protection] Honeypot field was filled');
      return { 
        isValid: false, 
        error: 'Error de validación. Por favor, recarga la página e inténtalo de nuevo.' 
      };
    }

    // Check timing - forms filled too quickly are suspicious
    const timeElapsed = Date.now() - state.formLoadTime;
    if (timeElapsed < MIN_SUBMISSION_TIME_MS) {
      console.warn('[Bot Protection] Form submitted too quickly:', timeElapsed, 'ms');
      return { 
        isValid: false, 
        error: 'Por favor, tómate un momento para completar el formulario.' 
      };
    }

    // Check rate limit
    try {
      const stored = localStorage.getItem(RATE_LIMIT_KEY);
      if (stored) {
        const data: RateLimitData = JSON.parse(stored);
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        const recentSubmissions = data.timestamps.filter(t => t > oneHourAgo);

        if (recentSubmissions.length >= MAX_SUBMISSIONS_PER_HOUR) {
          return { 
            isValid: false, 
            error: 'Has alcanzado el límite de envíos. Por favor, inténtalo más tarde.' 
          };
        }
      }
    } catch {
      // Ignore localStorage errors - continue with submission
    }

    return { isValid: true, error: null };
  }, [state.honeypotValue, state.formLoadTime]);

  const recordSubmission = useCallback(() => {
    try {
      const stored = localStorage.getItem(RATE_LIMIT_KEY);
      const data: RateLimitData = stored ? JSON.parse(stored) : { timestamps: [] };
      
      // Clean old entries and add new one
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      data.timestamps = data.timestamps.filter(t => t > oneHourAgo);
      data.timestamps.push(Date.now());
      
      localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(data));
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  return {
    honeypotProps: {
      value: state.honeypotValue,
      onChange: handleHoneypotChange,
      name: 'website_url', // Common honeypot field name
      tabIndex: -1,
      autoComplete: 'off',
      style: {
        position: 'absolute',
        left: '-9999px',
        opacity: 0,
        pointerEvents: 'none',
        height: 0,
        overflow: 'hidden',
      },
      'aria-hidden': true,
    },
    validateSubmission,
    recordSubmission,
    isBlocked: state.isBlocked,
    blockReason: state.blockReason,
  };
}
