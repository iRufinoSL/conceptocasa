import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface BrainNode {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  node_type: 'module' | 'data' | 'note';
  target_url: string | null;
  target_params: Record<string, any> | null;
  color: string | null;
  order_index: number;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

const MODULE_SEED: Omit<BrainNode, 'id' | 'user_id' | 'created_at' | 'updated_at'>[] = [
  { parent_id: null, name: 'TO.LO.SA.systems', description: 'Centro de operaciones', icon: 'Building2', node_type: 'module', target_url: '/dashboard', target_params: null, color: '#3B82F6', order_index: 0, is_pinned: true },
];

const MODULE_CHILDREN = [
  { name: 'Proyectos', icon: 'FolderKanban', target_url: '/proyectos', color: '#8B5CF6', order_index: 0 },
  { name: 'Presupuestos', icon: 'Calculator', target_url: '/presupuestos', color: '#F59E0B', order_index: 1 },
  { name: 'CRM', icon: 'Users', target_url: '/crm', color: '#10B981', order_index: 2 },
  { name: 'Agenda', icon: 'Calendar', target_url: '/agenda', color: '#EC4899', order_index: 3 },
  { name: 'Documentos', icon: 'FileText', target_url: '/documentos', color: '#6366F1', order_index: 4 },
  { name: 'Recursos', icon: 'Package', target_url: '/recursos', color: '#14B8A6', order_index: 5 },
  { name: 'Administración', icon: 'Wallet', target_url: '/administracion', color: '#F97316', order_index: 6 },
  { name: 'Usuarios', icon: 'UserCog', target_url: '/usuarios', color: '#64748B', order_index: 7 },
  { name: 'Configuración', icon: 'Settings', target_url: '/configuracion', color: '#78716C', order_index: 8 },
];

const BRAIN_LAST_NODE_KEY = 'brain_last_active_node';
const BUDGET_CATEGORIES = [
  { name: 'Activos', icon: 'FolderKanban', color: '#22C55E', order: 0, filter: 'activo' },
  { name: 'En Ejecución', icon: 'Layers', color: '#F59E0B', order: 1, filter: 'en_ejecucion' },
  { name: 'Archivados', icon: 'Package', color: '#94A3B8', order: 2, filter: 'archived' },
] as const;

const BUDGET_CATEGORY_NAMES = BUDGET_CATEGORIES.map(category => category.name);

const extractBudgetIdFromNode = (node: BrainNode): string | null => {
  const budgetIdFromParams = (node.target_params as { budgetId?: unknown } | null)?.budgetId;
  if (typeof budgetIdFromParams === 'string' && budgetIdFromParams) {
    return budgetIdFromParams;
  }

  if (typeof node.target_url === 'string' && node.target_url.startsWith('/presupuestos/')) {
    const [, , budgetId] = node.target_url.split('/');
    return budgetId || null;
  }

  return null;
};

const resolveBudgetCategoryName = (status: string | null | undefined, archived: boolean | null | undefined) => {
  if (archived) return 'Archivados';
  if (status === 'en_ejecucion') return 'En Ejecución';
  return 'Activos';
};

export function useBrainNodes() {
  const { user } = useAuth();
  const [nodes, setNodes] = useState<BrainNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  const ensureBudgetHierarchy = useCallback(async (currentNodes: BrainNode[]) => {
    if (!user) return false;

    const budgetsNode = currentNodes.find(
      node => node.name === 'Presupuestos' && node.target_url === '/presupuestos',
    );

    if (!budgetsNode) return false;

    const directChildren = currentNodes.filter(node => node.parent_id === budgetsNode.id);
    const existingCategories = directChildren.filter(node => BUDGET_CATEGORY_NAMES.includes(node.name as any));
    const categoryByName = new Map(existingCategories.map(node => [node.name, node]));

    let didChange = false;

    const missingCategories = BUDGET_CATEGORIES.filter(category => !categoryByName.has(category.name));
    if (missingCategories.length > 0) {
      const { data: insertedCategories, error: insertCategoriesError } = await supabase
        .from('brain_nodes')
        .insert(
          missingCategories.map(category => ({
            user_id: user.id,
            parent_id: budgetsNode.id,
            name: category.name,
            icon: category.icon,
            node_type: 'module' as const,
            target_url: '/presupuestos',
            target_params: { filter: category.filter },
            color: category.color,
            order_index: category.order,
          })),
        )
        .select();

      if (insertCategoriesError) {
        console.error('Error creating budget categories in Brain:', insertCategoriesError);
      } else {
        insertedCategories?.forEach((category: any) => {
          categoryByName.set(category.name, category as BrainNode);
        });
        didChange = true;
      }
    }

    const misplacedBudgetNodes = directChildren.filter(node => {
      if (node.node_type !== 'data') return false;
      return Boolean(extractBudgetIdFromNode(node));
    });

    if (misplacedBudgetNodes.length === 0) {
      return didChange;
    }

    const budgetIds = Array.from(new Set(
      misplacedBudgetNodes
        .map(extractBudgetIdFromNode)
        .filter((budgetId): budgetId is string => Boolean(budgetId)),
    ));

    if (budgetIds.length === 0) {
      return didChange;
    }

    const { data: budgets, error: budgetsError } = await supabase
      .from('presupuestos')
      .select('id, status, archived')
      .in('id', budgetIds);

    if (budgetsError) {
      console.error('Error loading budget status for Brain hierarchy:', budgetsError);
      return didChange;
    }

    const budgetsById = new Map((budgets || []).map((budget: any) => [budget.id, budget]));

    const nextOrderByCategory = new Map<string, number>();
    BUDGET_CATEGORY_NAMES.forEach(categoryName => {
      const categoryNode = categoryByName.get(categoryName);
      if (!categoryNode) {
        nextOrderByCategory.set(categoryName, 0);
        return;
      }
      const maxOrder = currentNodes
        .filter(node => node.parent_id === categoryNode.id)
        .reduce((max, node) => Math.max(max, node.order_index), -1);
      nextOrderByCategory.set(categoryName, maxOrder + 1);
    });

    const updates = misplacedBudgetNodes.map(node => {
      const budgetId = extractBudgetIdFromNode(node);
      const budget = budgetId ? budgetsById.get(budgetId) : null;
      const categoryName = resolveBudgetCategoryName(budget?.status, budget?.archived);
      const categoryNode = categoryByName.get(categoryName) || categoryByName.get('Activos');
      const orderIndex = nextOrderByCategory.get(categoryName) ?? 0;
      nextOrderByCategory.set(categoryName, orderIndex + 1);

      return {
        nodeId: node.id,
        parentId: categoryNode?.id || budgetsNode.id,
        orderIndex,
      };
    });

    const updateResults = await Promise.all(
      updates.map(update => supabase
        .from('brain_nodes')
        .update({ parent_id: update.parentId, order_index: update.orderIndex })
        .eq('id', update.nodeId)),
    );

    updateResults.forEach(result => {
      if (result.error) {
        console.error('Error moving budget node into category:', result.error);
      } else {
        didChange = true;
      }
    });

    return didChange;
  }, [user]);

  const fetchNodes = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('brain_nodes')
      .select('*')
      .order('order_index', { ascending: true });

    if (error) {
      console.error('Error fetching brain nodes:', error);
      return;
    }

    const typedData = (data || []).map((d: any) => ({
      ...d,
      node_type: d.node_type as 'module' | 'data' | 'note',
      target_params: d.target_params as Record<string, any> | null,
    })) as BrainNode[];

    if (typedData.length === 0) {
      await seedNodes();
      return;
    }

    const hierarchyUpdated = await ensureBudgetHierarchy(typedData);
    if (hierarchyUpdated) {
      await fetchNodes();
      return;
    }

    setNodes(typedData);
    if (!activeNodeId) {
      // Restore last active node from localStorage
      const savedNodeId = localStorage.getItem(BRAIN_LAST_NODE_KEY);
      const savedNode = savedNodeId ? typedData.find(n => n.id === savedNodeId) : null;
      const root = typedData.find(n => n.parent_id === null);
      setActiveNodeId(savedNode?.id || root?.id || null);
    }
    setLoading(false);
  }, [user, activeNodeId, ensureBudgetHierarchy]);

  const seedNodes = useCallback(async () => {
    if (!user) return;

    // Create root node
    const { data: rootData, error: rootErr } = await supabase
      .from('brain_nodes')
      .insert({
        user_id: user.id,
        parent_id: null,
        name: 'TO.LO.SA.systems',
        description: 'Centro de operaciones',
        icon: 'Building2',
        node_type: 'module',
        target_url: '/dashboard',
        color: '#3B82F6',
        order_index: 0,
        is_pinned: true,
      })
      .select()
      .single();

    if (rootErr || !rootData) {
      console.error('Error seeding root:', rootErr);
      setLoading(false);
      return;
    }

    // Create module children
    const childInserts = MODULE_CHILDREN.map(c => ({
      user_id: user.id,
      parent_id: rootData.id,
      name: c.name,
      icon: c.icon,
      node_type: 'module' as const,
      target_url: c.target_url,
      color: c.color,
      order_index: c.order_index,
    }));

    const { data: childData, error: childErr } = await supabase
      .from('brain_nodes')
      .insert(childInserts)
      .select();

    if (childErr) {
      console.error('Error seeding children:', childErr);
    }

    // Now seed presupuestos grouped by status as children of "Presupuestos" node
    const presNode = childData?.find((c: any) => c.name === 'Presupuestos');
    if (presNode) {
      // Create status category sub-nodes
      const statusCategories = [
        { name: 'Activos', icon: 'FolderKanban', color: '#22C55E', statusFilter: 'activo', archivedFilter: false, order: 0 },
        { name: 'En Ejecución', icon: 'Layers', color: '#F59E0B', statusFilter: 'en_ejecucion', archivedFilter: false, order: 1 },
        { name: 'Archivados', icon: 'Package', color: '#94A3B8', statusFilter: null, archivedFilter: true, order: 2 },
      ];

      const { data: categoryData } = await supabase
        .from('brain_nodes')
        .insert(statusCategories.map(cat => ({
          user_id: user.id,
          parent_id: presNode.id,
          name: cat.name,
          icon: cat.icon,
          node_type: 'module' as const,
          target_url: '/presupuestos',
          target_params: { filter: cat.statusFilter || 'archived' },
          color: cat.color,
          order_index: cat.order,
        })))
        .select();

      // Fetch all budgets and assign to categories
      const { data: budgets } = await supabase
        .from('presupuestos')
        .select('id, nombre, status, archived')
        .order('created_at', { ascending: false })
        .limit(100);

      if (budgets && budgets.length > 0 && categoryData) {
        const budgetInserts: any[] = [];
        budgets.forEach((b: any, i: number) => {
          let parentCat: any = null;
          if (b.archived) {
            parentCat = categoryData.find((c: any) => c.name === 'Archivados');
          } else if (b.status === 'en_ejecucion') {
            parentCat = categoryData.find((c: any) => c.name === 'En Ejecución');
          } else {
            parentCat = categoryData.find((c: any) => c.name === 'Activos');
          }
          if (parentCat) {
            budgetInserts.push({
              user_id: user.id,
              parent_id: parentCat.id,
              name: b.nombre || 'Sin nombre',
              icon: 'FileSpreadsheet',
              node_type: 'data' as const,
              target_url: `/presupuestos/${b.id}`,
              target_params: { budgetId: b.id },
              color: parentCat.color,
              order_index: i,
            });
          }
        });
        if (budgetInserts.length > 0) {
          await supabase.from('brain_nodes').insert(budgetInserts);
        }
      }
    }

    // Refetch after seeding
    await fetchNodes();
  }, [user]);

  useEffect(() => {
    fetchNodes();
  }, [fetchNodes]);

  const getActiveNode = useCallback(() => {
    return nodes.find(n => n.id === activeNodeId) || null;
  }, [nodes, activeNodeId]);

  const getParent = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node?.parent_id) return null;
    return nodes.find(n => n.id === node.parent_id) || null;
  }, [nodes]);

  const getChildren = useCallback((nodeId: string) => {
    return nodes.filter(n => n.parent_id === nodeId).sort((a, b) => a.order_index - b.order_index);
  }, [nodes]);

  const getSiblings = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return [];
    return nodes
      .filter(n => n.parent_id === node.parent_id && n.id !== nodeId)
      .sort((a, b) => a.order_index - b.order_index);
  }, [nodes]);

  const addNode = useCallback(async (parentId: string | null, name: string, nodeType: 'note' | 'data' = 'note') => {
    if (!user) return;
    const siblings = parentId ? getChildren(parentId) : nodes.filter(n => !n.parent_id);
    const { data, error } = await supabase
      .from('brain_nodes')
      .insert({
        user_id: user.id,
        parent_id: parentId,
        name,
        node_type: nodeType,
        order_index: siblings.length,
        color: '#94A3B8',
      })
      .select()
      .single();

    if (error) {
      toast.error('Error al crear nodo');
      return;
    }
    await fetchNodes();
    return data;
  }, [user, nodes, getChildren, fetchNodes]);

  const updateNode = useCallback(async (nodeId: string, updates: Partial<Pick<BrainNode, 'name' | 'description' | 'color' | 'icon'>>) => {
    const { error } = await supabase
      .from('brain_nodes')
      .update(updates)
      .eq('id', nodeId);

    if (error) {
      toast.error('Error al actualizar nodo');
      return;
    }
    await fetchNodes();
  }, [fetchNodes]);

  const deleteNode = useCallback(async (nodeId: string) => {
    const { error } = await supabase
      .from('brain_nodes')
      .delete()
      .eq('id', nodeId);

    if (error) {
      toast.error('Error al eliminar nodo');
      return;
    }
    if (activeNodeId === nodeId) {
      const parent = getParent(nodeId);
      setActiveNodeId(parent?.id || null);
    }
    await fetchNodes();
  }, [activeNodeId, getParent, fetchNodes]);

  const navigateTo = useCallback((nodeId: string) => {
    setActiveNodeId(nodeId);
    localStorage.setItem(BRAIN_LAST_NODE_KEY, nodeId);
  }, []);

  const getBreadcrumbs = useCallback(() => {
    const crumbs: BrainNode[] = [];
    let current = getActiveNode();
    while (current) {
      crumbs.unshift(current);
      current = current.parent_id ? nodes.find(n => n.id === current!.parent_id) || null : null;
    }
    return crumbs;
  }, [getActiveNode, nodes]);

  return {
    nodes,
    loading,
    activeNodeId,
    getActiveNode,
    getParent,
    getChildren,
    getSiblings,
    addNode,
    updateNode,
    deleteNode,
    navigateTo,
    getBreadcrumbs,
    fetchNodes,
  };
}
