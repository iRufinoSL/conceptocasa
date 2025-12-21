import { useInactivityTimeout } from '@/hooks/useInactivityTimeout';

export function InactivityHandler() {
  useInactivityTimeout();
  return null;
}
