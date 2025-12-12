import { toast } from 'sonner';

/**
 * Validates that a URL uses a safe protocol (http or https only)
 * Prevents XSS attacks via javascript:, data:, vbscript: URLs
 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Opens a URL in a new tab only if it's safe (http/https protocol)
 * Blocks dangerous protocols like javascript:, data:, etc.
 */
export function openSafeUrl(url: string | undefined) {
  if (!url) return;
  
  if (isSafeUrl(url)) {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    console.warn('Blocked unsafe URL:', url);
    toast.error('URL inválida o insegura');
  }
}
