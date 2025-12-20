import { useMemo, useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'administrador' | 'colaborador' | 'cliente';
export type AccessLevel = 'view' | 'edit';

export interface GranularAccess {
  activityAccess: Map<string, AccessLevel>;
  resourceAccess: Map<string, AccessLevel>;
}

export interface BudgetPermissions {
  // Field visibility
  canViewCosts: boolean;           // External unit cost, internal cost
  canViewMargins: boolean;         // Safety margin %, Sales margin %
  canViewCostDetails: boolean;     // Safety margin €, Sales margin €, internal cost €
  
  // Actions
  canCreate: boolean;
  canEdit: boolean;
  canDuplicate: boolean;
  canDelete: boolean;
  
  // Role info
  role: AppRole | null;
  isAdmin: boolean;
  isColaborador: boolean;
  isCliente: boolean;
  
  // Granular access
  granularAccess: GranularAccess;
  hasGranularAccess: boolean;
}

/**
 * Hook to get permissions for a specific budget/presupuesto
 * Permissions are determined by the user's role for that specific budget
 * 
 * Role permissions:
 * - Administrador: Full access to everything
 * - Colaborador: Can view most things, but NOT costs and margins. Can edit/duplicate but NOT delete
 * - Cliente: Same as Colaborador but can ONLY view (no edit, duplicate, or delete)
 */
export function usePermissions(presupuestoId?: string): BudgetPermissions {
  const { isAdmin, getPresupuestoRole, roles, user } = useAuth();
  const [granularAccess, setGranularAccess] = useState<GranularAccess>({
    activityAccess: new Map(),
    resourceAccess: new Map()
  });
  const [hasGranularAccess, setHasGranularAccess] = useState(false);
  
  // Fetch granular access for this user and budget
  useEffect(() => {
    const fetchGranularAccess = async () => {
      if (!user || !presupuestoId) {
        setGranularAccess({ activityAccess: new Map(), resourceAccess: new Map() });
        setHasGranularAccess(false);
        return;
      }
      
      try {
        // Fetch activity access
        const { data: activityData } = await supabase
          .from('user_activity_access')
          .select('activity_id, access_level')
          .eq('user_id', user.id);
        
        // Fetch resource access
        const { data: resourceData } = await supabase
          .from('user_resource_access')
          .select('resource_id, access_level')
          .eq('user_id', user.id);
        
        const activityAccessMap = new Map<string, AccessLevel>();
        const resourceAccessMap = new Map<string, AccessLevel>();
        
        (activityData || []).forEach(a => {
          activityAccessMap.set(a.activity_id, a.access_level as AccessLevel);
        });
        
        (resourceData || []).forEach(r => {
          resourceAccessMap.set(r.resource_id, r.access_level as AccessLevel);
        });
        
        setGranularAccess({
          activityAccess: activityAccessMap,
          resourceAccess: resourceAccessMap
        });
        setHasGranularAccess(activityAccessMap.size > 0 || resourceAccessMap.size > 0);
      } catch (error) {
        console.error('Error fetching granular access:', error);
      }
    };
    
    fetchGranularAccess();
  }, [user, presupuestoId]);
  
  return useMemo(() => {
    // Global admins always have full access
    if (isAdmin()) {
      return {
        canViewCosts: true,
        canViewMargins: true,
        canViewCostDetails: true,
        canCreate: true,
        canEdit: true,
        canDuplicate: true,
        canDelete: true,
        role: 'administrador',
        isAdmin: true,
        isColaborador: false,
        isCliente: false,
        granularAccess,
        hasGranularAccess: false, // Admins don't need granular access
      };
    }
    
    // Get the user's role for this specific presupuesto
    const budgetRole = presupuestoId ? getPresupuestoRole(presupuestoId) : null;
    
    // If user has a budget-specific role, use that
    if (budgetRole) {
      return { ...getPermissionsForRole(budgetRole), granularAccess, hasGranularAccess };
    }
    
    // Fall back to global roles if no budget-specific role
    if (roles.includes('colaborador')) {
      return { ...getPermissionsForRole('colaborador'), granularAccess, hasGranularAccess };
    }
    
    if (roles.includes('cliente')) {
      return { ...getPermissionsForRole('cliente'), granularAccess, hasGranularAccess };
    }
    
    // No role - no access (shouldn't happen if auth is working correctly)
    return {
      canViewCosts: false,
      canViewMargins: false,
      canViewCostDetails: false,
      canCreate: false,
      canEdit: false,
      canDuplicate: false,
      canDelete: false,
      role: null,
      isAdmin: false,
      isColaborador: false,
      isCliente: false,
      granularAccess,
      hasGranularAccess: false,
    };
  }, [isAdmin, getPresupuestoRole, presupuestoId, roles, granularAccess, hasGranularAccess]);
}

function getPermissionsForRole(role: AppRole): Omit<BudgetPermissions, 'granularAccess' | 'hasGranularAccess'> {
  switch (role) {
    case 'administrador':
      return {
        canViewCosts: true,
        canViewMargins: true,
        canViewCostDetails: true,
        canCreate: true,
        canEdit: true,
        canDuplicate: true,
        canDelete: true,
        role: 'administrador',
        isAdmin: true,
        isColaborador: false,
        isCliente: false,
      };
      
    case 'colaborador':
      // Colaborador: Cannot view costs/margins, can edit/duplicate but NOT delete
      return {
        canViewCosts: false,      // Cannot see €Coste ud externa, €Coste ud interna
        canViewMargins: false,    // Cannot see %Margen seguridad, %Margen venta
        canViewCostDetails: false, // Cannot see €Margen seguridad ud, €Margen venta ud
        canCreate: true,
        canEdit: true,
        canDuplicate: true,
        canDelete: false,         // Cannot delete
        role: 'colaborador',
        isAdmin: false,
        isColaborador: true,
        isCliente: false,
      };
      
    case 'cliente':
      // Cliente: Same visibility as Colaborador, but can ONLY view (no actions)
      return {
        canViewCosts: false,
        canViewMargins: false,
        canViewCostDetails: false,
        canCreate: false,
        canEdit: false,
        canDuplicate: false,
        canDelete: false,
        role: 'cliente',
        isAdmin: false,
        isColaborador: false,
        isCliente: true,
      };
      
    default:
      return {
        canViewCosts: false,
        canViewMargins: false,
        canViewCostDetails: false,
        canCreate: false,
        canEdit: false,
        canDuplicate: false,
        canDelete: false,
        role: null,
        isAdmin: false,
        isColaborador: false,
        isCliente: false,
      };
  }
}

/**
 * Hook for quick permission check without budget context
 * Uses global role only
 */
export function useGlobalPermissions(): BudgetPermissions {
  return usePermissions(undefined);
}

/**
 * Helper function to check granular access for an activity
 */
export function canAccessActivity(
  permissions: BudgetPermissions,
  activityId: string,
  requiredLevel: AccessLevel = 'view'
): boolean {
  // Admins always have access
  if (permissions.isAdmin) return true;
  
  // If no granular access defined, use base permissions
  if (!permissions.hasGranularAccess) {
    return requiredLevel === 'view' || permissions.canEdit;
  }
  
  // Check granular access
  const level = permissions.granularAccess.activityAccess.get(activityId);
  if (!level) return false;
  
  if (requiredLevel === 'view') return true;
  if (requiredLevel === 'edit') return level === 'edit';
  
  return false;
}

/**
 * Helper function to check granular access for a resource
 */
export function canAccessResource(
  permissions: BudgetPermissions,
  resourceId: string,
  requiredLevel: AccessLevel = 'view'
): boolean {
  // Admins always have access
  if (permissions.isAdmin) return true;
  
  // If no granular access defined, use base permissions
  if (!permissions.hasGranularAccess) {
    return requiredLevel === 'view' || permissions.canEdit;
  }
  
  // Check granular access
  const level = permissions.granularAccess.resourceAccess.get(resourceId);
  if (!level) return false;
  
  if (requiredLevel === 'view') return true;
  if (requiredLevel === 'edit') return level === 'edit';
  
  return false;
}
