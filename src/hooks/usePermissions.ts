import { useMemo } from 'react';
import { useAuth } from './useAuth';

export type AppRole = 'administrador' | 'colaborador' | 'cliente';

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
  const { isAdmin, getPresupuestoRole, roles } = useAuth();
  
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
      };
    }
    
    // Get the user's role for this specific presupuesto
    const budgetRole = presupuestoId ? getPresupuestoRole(presupuestoId) : null;
    
    // If user has a budget-specific role, use that
    if (budgetRole) {
      return getPermissionsForRole(budgetRole);
    }
    
    // Fall back to global roles if no budget-specific role
    if (roles.includes('colaborador')) {
      return getPermissionsForRole('colaborador');
    }
    
    if (roles.includes('cliente')) {
      return getPermissionsForRole('cliente');
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
    };
  }, [isAdmin, getPresupuestoRole, presupuestoId, roles]);
}

function getPermissionsForRole(role: AppRole): BudgetPermissions {
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
