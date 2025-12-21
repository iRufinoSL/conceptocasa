import { useAuthContext } from '@/context/AuthContext';

// Backwards-compatible hook API: components can keep importing from "@/hooks/useAuth".
export function useAuth() {
  return useAuthContext();
}

