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

export function useBrainNodes() {
  const { user } = useAuth();
  const [nodes, setNodes] = useState<BrainNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

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
      // Seed initial nodes
      await seedNodes();
      return;
    }

    setNodes(typedData);
    if (!activeNodeId) {
      const root = typedData.find(n => n.parent_id === null);
      if (root) setActiveNodeId(root.id);
    }
    setLoading(false);
  }, [user, activeNodeId]);

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

    // Now seed presupuestos as children of "Presupuestos" node
    const presNode = childData?.find((c: any) => c.name === 'Presupuestos');
    if (presNode) {
      const { data: budgets } = await supabase
        .from('presupuestos')
        .select('id, nombre')
        .order('created_at', { ascending: false })
        .limit(50);

      if (budgets && budgets.length > 0) {
        const budgetInserts = budgets.map((b: any, i: number) => ({
          user_id: user.id,
          parent_id: presNode.id,
          name: b.nombre || 'Sin nombre',
          icon: 'FileSpreadsheet',
          node_type: 'data' as const,
          target_url: `/presupuestos/${b.id}`,
          target_params: { budgetId: b.id },
          color: '#F59E0B',
          order_index: i,
        }));

        await supabase.from('brain_nodes').insert(budgetInserts);
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
