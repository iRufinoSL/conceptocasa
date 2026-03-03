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

const BUDGET_CATEGORY_NAMES = BUDGET_CATEGORIES.map(c => c.name);

// Primary sub-levels for each budget (the 6 key questions)
const BUDGET_PRIMARY_SUBLEVELS = [
  { name: 'QUÉ?', icon: 'ClipboardList', color: '#3B82F6', tab: 'actividades', order: 0 },
  { name: 'CÓMO?', icon: 'FileText', color: '#8B5CF6', tab: 'recursos', order: 1 },
  { name: 'DÓNDE?', icon: 'MapPin', color: '#10B981', tab: 'areas-trabajo', order: 2 },
  { name: 'CUÁNDO?', icon: 'Calendar', color: '#EC4899', tab: 'fases', order: 3 },
  { name: 'CUÁNTO?', icon: 'Euro', color: '#F59E0B', tab: 'cuanto-cuesta', order: 4 },
  { name: 'QUIÉN?', icon: 'Users', color: '#6366F1', tab: 'contactos', order: 5 },
];

// Secondary menu items for each budget
const BUDGET_SECONDARY_SUBLEVELS = [
  { name: 'Urbanismo', icon: 'Landmark', color: '#78716C', tab: 'urbanismo', order: 0 },
  { name: 'Ante-proyecto', icon: 'Image', color: '#78716C', tab: 'anteproyecto', order: 1 },
  { name: 'Mediciones', icon: 'Ruler', color: '#78716C', tab: 'mediciones', order: 2 },
  { name: 'Documentos', icon: 'FolderOpen', color: '#78716C', tab: 'documentos', order: 3 },
  { name: 'Agenda', icon: 'CalendarCheck', color: '#78716C', tab: 'agenda', order: 4 },
  { name: 'Comunicaciones', icon: 'Mail', color: '#78716C', tab: 'comunicaciones', order: 5 },
  { name: 'Administración', icon: 'Wallet', color: '#78716C', tab: 'administracion', order: 6 },
  { name: 'Resumen', icon: 'Calculator', color: '#78716C', tab: 'resumen', order: 7 },
];

// Sub-items under DÓNDE?
const DONDE_SUBLEVELS = [
  { name: 'Volúmenes', icon: 'Home', color: '#10B981', tab: 'espacios', order: 0, description: 'Espacios con coordenadas XYZ' },
  { name: 'Planos', icon: 'PenTool', color: '#14B8A6', tab: 'plano', order: 1, description: 'Cuadrículas por nivel' },
  { name: 'Alzados', icon: 'Layers', color: '#0EA5E9', tab: 'alzados', order: 2, description: 'Vistas de alzados por fachada' },
];

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

  // Ensure budget sub-levels exist for a given budget node
  const ensureBudgetSublevels = useCallback(async (budgetNode: BrainNode, currentNodes: BrainNode[]) => {
    if (!user) return false;
    const budgetId = extractBudgetIdFromNode(budgetNode);
    if (!budgetId) return false;

    const existingChildren = currentNodes.filter(n => n.parent_id === budgetNode.id);
    const existingNames = new Set(existingChildren.map(n => n.name));

    let didChange = false;

    // Create missing primary sublevels
    const missingPrimary = BUDGET_PRIMARY_SUBLEVELS.filter(s => !existingNames.has(s.name));
    if (missingPrimary.length > 0) {
      const { data: primaryData, error } = await supabase
        .from('brain_nodes')
        .insert(missingPrimary.map(s => ({
          user_id: user.id,
          parent_id: budgetNode.id,
          name: s.name,
          icon: s.icon,
          node_type: 'module' as const,
          target_url: `/presupuestos/${budgetId}`,
          target_params: { budgetId, tab: s.tab },
          color: s.color,
          order_index: s.order,
        })))
        .select();

      if (!error && primaryData) {
        didChange = true;
        // Create DÓNDE? sub-items for newly created DÓNDE node
        const dondeNode = primaryData.find((n: any) => n.name === 'DÓNDE?');
        if (dondeNode) {
          const { error: dondeErr } = await supabase
            .from('brain_nodes')
            .insert(DONDE_SUBLEVELS.map(s => ({
              user_id: user.id,
              parent_id: dondeNode.id,
              name: s.name,
              description: s.description,
              icon: s.icon,
              node_type: 'module' as const,
              target_url: `/presupuestos/${budgetId}`,
              target_params: { budgetId, tab: s.tab },
              color: s.color,
              order_index: s.order,
            })));
          if (dondeErr) console.error('Error creating DÓNDE sublevels:', dondeErr);
        }
      } else if (error) {
        console.error('Error creating budget sublevels:', error);
      }
    }

    // Ensure DÓNDE? sub-items are complete (e.g. Alzados added later)
    const dondeNode = existingChildren.find(n => n.name === 'DÓNDE?');
    if (dondeNode) {
      const dondeChildren = currentNodes.filter(n => n.parent_id === dondeNode.id);
      const dondeChildNames = new Set(dondeChildren.map(n => n.name));
      const missingDonde = DONDE_SUBLEVELS.filter(s => !dondeChildNames.has(s.name));
      if (missingDonde.length > 0) {
        const { error: dondeErr } = await supabase
          .from('brain_nodes')
          .insert(missingDonde.map(s => ({
            user_id: user.id,
            parent_id: dondeNode.id,
            name: s.name,
            description: s.description,
            icon: s.icon,
            node_type: 'module' as const,
            target_url: `/presupuestos/${budgetId}`,
            target_params: { budgetId, tab: s.tab },
            color: s.color,
            order_index: s.order,
          })));
        if (!dondeErr) didChange = true;
        else console.error('Error creating missing DÓNDE sublevels:', dondeErr);
      }
    }

    // Create secondary menu group node + items
    const secondaryGroupName = 'Más...';
    if (!existingNames.has(secondaryGroupName)) {
      const { data: groupData, error: groupErr } = await supabase
        .from('brain_nodes')
        .insert({
          user_id: user.id,
          parent_id: budgetNode.id,
          name: secondaryGroupName,
          icon: 'MoreHorizontal',
          node_type: 'module' as const,
          target_url: `/presupuestos/${budgetId}`,
          target_params: { budgetId },
          color: '#78716C',
          order_index: 10,
        })
        .select()
        .single();

      if (!groupErr && groupData) {
        didChange = true;
        await supabase
          .from('brain_nodes')
          .insert(BUDGET_SECONDARY_SUBLEVELS.map(s => ({
            user_id: user.id,
            parent_id: groupData.id,
            name: s.name,
            icon: s.icon,
            node_type: 'module' as const,
            target_url: `/presupuestos/${budgetId}`,
            target_params: { budgetId, tab: s.tab },
            color: s.color,
            order_index: s.order,
          })));
      }
    }

    return didChange;
  }, [user]);

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

    // Move misplaced budget nodes into correct category
    const misplacedBudgetNodes = directChildren.filter(node => {
      if (node.node_type !== 'data') return false;
      return Boolean(extractBudgetIdFromNode(node));
    });

    if (misplacedBudgetNodes.length > 0) {
      const budgetIds = Array.from(new Set(
        misplacedBudgetNodes
          .map(extractBudgetIdFromNode)
          .filter((id): id is string => Boolean(id)),
      ));

      if (budgetIds.length > 0) {
        const { data: budgets } = await supabase
          .from('presupuestos')
          .select('id, status, archived')
          .in('id', budgetIds);

        const budgetsById = new Map((budgets || []).map((b: any) => [b.id, b]));
        const nextOrderByCategory = new Map<string, number>();
        BUDGET_CATEGORY_NAMES.forEach(catName => {
          const catNode = categoryByName.get(catName);
          if (!catNode) { nextOrderByCategory.set(catName, 0); return; }
          const maxOrder = currentNodes
            .filter(n => n.parent_id === catNode.id)
            .reduce((max, n) => Math.max(max, n.order_index), -1);
          nextOrderByCategory.set(catName, maxOrder + 1);
        });

        await Promise.all(misplacedBudgetNodes.map(node => {
          const bId = extractBudgetIdFromNode(node);
          const budget = bId ? budgetsById.get(bId) : null;
          const catName = resolveBudgetCategoryName(budget?.status, budget?.archived);
          const catNode = categoryByName.get(catName) || categoryByName.get('Activos');
          const orderIdx = nextOrderByCategory.get(catName) ?? 0;
          nextOrderByCategory.set(catName, orderIdx + 1);
          return supabase
            .from('brain_nodes')
            .update({ parent_id: catNode?.id || budgetsNode.id, order_index: orderIdx })
            .eq('id', node.id);
        }));
        didChange = true;
      }
    }

    // Ensure sublevels for all budget data nodes
    const allBudgetNodes = currentNodes.filter(n =>
      n.node_type === 'data' && extractBudgetIdFromNode(n),
    );
    for (const budgetNode of allBudgetNodes) {
      const sublevelCreated = await ensureBudgetSublevels(budgetNode, currentNodes);
      if (sublevelCreated) didChange = true;
    }

    return didChange;
  }, [user, ensureBudgetSublevels]);

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
    const { data: childData, error: childErr } = await supabase
      .from('brain_nodes')
      .insert(MODULE_CHILDREN.map(c => ({
        user_id: user.id,
        parent_id: rootData.id,
        name: c.name,
        icon: c.icon,
        node_type: 'module' as const,
        target_url: c.target_url,
        color: c.color,
        order_index: c.order_index,
      })))
      .select();

    if (childErr) {
      console.error('Error seeding children:', childErr);
    }

    // Seed Presupuestos hierarchy
    const presNode = childData?.find((c: any) => c.name === 'Presupuestos');
    if (presNode) {
      const { data: categoryData } = await supabase
        .from('brain_nodes')
        .insert(BUDGET_CATEGORIES.map(cat => ({
          user_id: user.id,
          parent_id: presNode.id,
          name: cat.name,
          icon: cat.icon,
          node_type: 'module' as const,
          target_url: '/presupuestos',
          target_params: { filter: cat.filter },
          color: cat.color,
          order_index: cat.order,
        })))
        .select();

      // Fetch budgets and create nodes with sub-levels
      const { data: budgets } = await supabase
        .from('presupuestos')
        .select('id, nombre, status, archived')
        .order('created_at', { ascending: false })
        .limit(100);

      if (budgets && budgets.length > 0 && categoryData) {
        for (const [i, b] of budgets.entries()) {
          let parentCat: any = null;
          if ((b as any).archived) {
            parentCat = categoryData.find((c: any) => c.name === 'Archivados');
          } else if ((b as any).status === 'en_ejecucion') {
            parentCat = categoryData.find((c: any) => c.name === 'En Ejecución');
          } else {
            parentCat = categoryData.find((c: any) => c.name === 'Activos');
          }
          if (!parentCat) continue;

          const { data: budgetNode } = await supabase
            .from('brain_nodes')
            .insert({
              user_id: user.id,
              parent_id: parentCat.id,
              name: (b as any).nombre || 'Sin nombre',
              icon: 'FileSpreadsheet',
              node_type: 'data' as const,
              target_url: `/presupuestos/${b.id}`,
              target_params: { budgetId: b.id },
              color: parentCat.color,
              order_index: i,
            })
            .select()
            .single();

          // Create sub-levels for this budget
          if (budgetNode) {
            // Primary sub-levels
            const { data: primaryData } = await supabase
              .from('brain_nodes')
              .insert(BUDGET_PRIMARY_SUBLEVELS.map(s => ({
                user_id: user.id,
                parent_id: budgetNode.id,
                name: s.name,
                icon: s.icon,
                node_type: 'module' as const,
                target_url: `/presupuestos/${b.id}`,
                target_params: { budgetId: b.id, tab: s.tab },
                color: s.color,
                order_index: s.order,
              })))
              .select();

            // DÓNDE sub-items
            const dondeNode = primaryData?.find((n: any) => n.name === 'DÓNDE?');
            if (dondeNode) {
              await supabase
                .from('brain_nodes')
                .insert(DONDE_SUBLEVELS.map(s => ({
                  user_id: user.id,
                  parent_id: dondeNode.id,
                  name: s.name,
                  description: s.description,
                  icon: s.icon,
                  node_type: 'module' as const,
                  target_url: `/presupuestos/${b.id}`,
                  target_params: { budgetId: b.id, tab: s.tab },
                  color: s.color,
                  order_index: s.order,
                })));
            }

            // Secondary menu group
            const { data: groupData } = await supabase
              .from('brain_nodes')
              .insert({
                user_id: user.id,
                parent_id: budgetNode.id,
                name: 'Más...',
                icon: 'MoreHorizontal',
                node_type: 'module' as const,
                target_url: `/presupuestos/${b.id}`,
                target_params: { budgetId: b.id },
                color: '#78716C',
                order_index: 10,
              })
              .select()
              .single();

            if (groupData) {
              await supabase
                .from('brain_nodes')
                .insert(BUDGET_SECONDARY_SUBLEVELS.map(s => ({
                  user_id: user.id,
                  parent_id: groupData.id,
                  name: s.name,
                  icon: s.icon,
                  node_type: 'module' as const,
                  target_url: `/presupuestos/${b.id}`,
                  target_params: { budgetId: b.id, tab: s.tab },
                  color: s.color,
                  order_index: s.order,
                })));
            }
          }
        }
      }
    }

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
