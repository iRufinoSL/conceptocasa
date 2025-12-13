import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type AppRole = 'administrador' | 'colaborador' | 'cliente';

interface UserRole {
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
  };
}

export function useAuth() {
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
        // Fetch roles
        const { data: rolesData, error: rolesError } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId);
        
        if (!isMounted) return;
        
        if (rolesError) {
          console.error('[useAuth] Error fetching roles:', rolesError);
        } else if (rolesData) {
          const fetchedRoles = rolesData.map((r: UserRole) => r.role);
          console.log('[useAuth] Roles loaded:', fetchedRoles);
          setRoles(fetchedRoles);
        }

        // Fetch presupuestos
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
              poblacion
            )
          `)
          .eq('user_id', userId);
        
        if (!isMounted) return;
        
        if (!presupuestosError && presupuestosData) {
          setUserPresupuestos(presupuestosData.map((up: any) => ({
            presupuesto_id: up.presupuesto_id,
            role: up.role,
            presupuesto: up.presupuestos
          })));
        }
      } finally {
        if (isMounted) {
          setRolesLoading(false);
        }
      }
    };
    
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[useAuth] Auth state changed:', event, session?.user?.email);
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          loadUserData(session.user.id);
        } else {
          setRoles([]);
          setUserPresupuestos([]);
          setRolesLoading(false);
        }
        
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      console.log('[useAuth] Got existing session:', session?.user?.email);
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
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
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
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    return { error };
  };

  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdmin = () => hasRole('administrador');
  const isColaborador = () => hasRole('colaborador');
  const isCliente = () => hasRole('cliente');

  const hasPresupuestoAccess = (presupuestoId: string) => {
    if (isAdmin()) return true;
    return userPresupuestos.some(up => up.presupuesto_id === presupuestoId);
  };

  const getPresupuestoRole = (presupuestoId: string): AppRole | null => {
    if (isAdmin()) return 'administrador';
    const up = userPresupuestos.find(up => up.presupuesto_id === presupuestoId);
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
    hasRole,
    isAdmin,
    isColaborador,
    isCliente,
    hasPresupuestoAccess,
    getPresupuestoRole,
  };
}
