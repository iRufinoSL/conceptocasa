import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

export type AppRole = 'administrador' | 'colaborador' | 'cliente';

interface UserRoleRow {
  role: AppRole;
}

interface UserPresupuesto {
  presupuesto_id: string;
  role: AppRole;
  presupuesto?: {
    id: string;
    nombre: string;
    codigo_correlativo: number;
    version: string;
    poblacion: string;
    created_at: string;
    project_id: string | null;
    project?: {
      id: string;
      name: string;
      status: string;
    } | null;
  };
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  rolesLoading: boolean;
  roles: AppRole[];
  userPresupuestos: UserPresupuesto[];
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  resetPasswordForEmail: (email: string) => Promise<{ error: Error | null }>;
  hasRole: (role: AppRole) => boolean;
  isAdmin: () => boolean;
  isColaborador: () => boolean;
  isCliente: () => boolean;
  hasPresupuestoAccess: (presupuestoId: string) => boolean;
  getPresupuestoRole: (presupuestoId: string) => AppRole | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [userPresupuestos, setUserPresupuestos] = useState<UserPresupuesto[]>([]);

  useEffect(() => {
    let isMounted = true;

    const loadUserData = async (userId: string) => {
      if (!isMounted) return;
      setRolesLoading(true);

      try {
        if (import.meta.env.DEV) console.log('[auth] Loading roles for user');
        
        const { data: rolesData, error: rolesError } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId);

        if (import.meta.env.DEV) console.log('[auth] Roles response:', { rolesError });

        if (!isMounted) return;

        if (rolesError) {
          console.error('[auth] Error fetching roles:', rolesError);
          setRoles([]);
        } else if (rolesData && rolesData.length > 0) {
          const userRoles = rolesData.map((r: UserRoleRow) => r.role);
          console.log('[auth] Setting roles:', userRoles);
          setRoles(userRoles);
        } else {
          console.log('[auth] No roles found for user');
          setRoles([]);
        }

        const { data: presupuestosData, error: presupuestosError } = await supabase
          .from('user_presupuestos')
          .select(`
            presupuesto_id,
            role,
            presupuestos (
              id,
              nombre,
              codigo_correlativo,
              version,
              poblacion,
              created_at,
              project_id,
              projects (
                id,
                name,
                status
              )
            )
          `)
          .eq('user_id', userId);

        if (!isMounted) return;

        if (!presupuestosError && presupuestosData) {
          setUserPresupuestos(
            presupuestosData.map((up: any) => ({
              presupuesto_id: up.presupuesto_id,
              role: up.role,
              presupuesto: up.presupuestos
                ? {
                    ...up.presupuestos,
                    project: up.presupuestos.projects,
                  }
                : undefined,
            }))
          );
        } else if (presupuestosError) {
          console.error('[auth] Error fetching presupuestos:', presupuestosError);
          setUserPresupuestos([]);
        }
      } finally {
        if (isMounted) setRolesLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        // Defer data loading to avoid any chance of deadlocks
        setTimeout(() => {
          loadUserData(session.user.id);
        }, 0);
      } else {
        setRoles([]);
        setUserPresupuestos([]);
        setRolesLoading(false);
      }

      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        loadUserData(session.user.id);
      } else {
        setRolesLoading(false);
      }

      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: (error as unknown as Error) ?? null };
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    const redirectUrl = `${window.location.origin}/`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });

    return { error: (error as unknown as Error) ?? null };
  };

  const signOut = async () => {
    // Use local scope so logout works even if the network call fails.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    setUser(null);
    setSession(null);
    setRoles([]);
    setUserPresupuestos([]);
    setRolesLoading(false);
    return { error: (error as unknown as Error) ?? null };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: (error as unknown as Error) ?? null };
  };

  const resetPasswordForEmail = async (email: string) => {
    const redirectUrl = `${window.location.origin}/auth?reset=true`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    return { error: (error as unknown as Error) ?? null };
  };

  const value = useMemo<AuthContextValue>(() => {
    const hasRole = (role: AppRole) => roles.includes(role);
    const isAdmin = () => hasRole('administrador');
    const isColaborador = () => hasRole('colaborador');
    const isCliente = () => hasRole('cliente');

    const hasPresupuestoAccess = (presupuestoId: string) => {
      if (isAdmin()) return true;
      return userPresupuestos.some((up) => up.presupuesto_id === presupuestoId);
    };

    const getPresupuestoRole = (presupuestoId: string): AppRole | null => {
      if (isAdmin()) return 'administrador';
      const up = userPresupuestos.find((up) => up.presupuesto_id === presupuestoId);
      return up?.role ?? null;
    };

    return {
      user,
      session,
      loading,
      rolesLoading,
      roles,
      userPresupuestos,
      signIn,
      signUp,
      signOut,
      updatePassword,
      resetPasswordForEmail,
      hasRole,
      isAdmin,
      isColaborador,
      isCliente,
      hasPresupuestoAccess,
      getPresupuestoRole,
    };
  }, [user, session, loading, rolesLoading, roles, userPresupuestos]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider />');
  return ctx;
}
