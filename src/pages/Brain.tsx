import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBrainNodes, BrainNode } from '@/hooks/useBrainNodes';
import { useAuth } from '@/hooks/useAuth';
import { BrainPlexView } from '@/components/brain/BrainPlexView';
import { BrainSidePanel } from '@/components/brain/BrainSidePanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Brain as BrainIcon, Plus, ChevronRight, Search, ArrowLeft, Home,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';

export default function Brain() {
  const navigate = useNavigate();
  const { isAdmin, isCliente, isColaborador, user, userPresupuestos } = useAuth();
  const {
    nodes, loading, activeNodeId,
    getActiveNode, getParent, getChildren, getSiblings,
    navigateTo, addNode, deleteNode, getBreadcrumbs,
  } = useBrainNodes();

  const [panelNode, setPanelNode] = useState<BrainNode | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newNodeName, setNewNodeName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const hasCheckedLastRoute = useRef(false);

  // Auto-redirect to last worked budget on initial load
  useEffect(() => {
    if (hasCheckedLastRoute.current || loading || !user) return;
    hasCheckedLastRoute.current = true;

    (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('last_route')
          .eq('id', user.id)
          .single();

        if (data?.last_route && data.last_route !== '/brain') {
          // If last route was a budget, navigate directly there
          if (data.last_route.startsWith('/presupuestos/')) {
            navigate(data.last_route, { replace: true });
          }
        }
      } catch {
        // Silent fail - stay on Brain
      }
    })();
  }, [loading, user, navigate]);

  // For non-admin users: filter nodes to only show their assigned projects/budgets
  const visibleNodes = (() => {
    if (isAdmin()) return nodes;
    
    // Client/Collaborator: they can see root, their projects, and their budgets
    const assignedBudgetIds = new Set(userPresupuestos.map(up => up.presupuesto_id));
    const assignedProjectIds = new Set(
      userPresupuestos
        .filter(up => up.presupuesto?.project_id)
        .map(up => up.presupuesto!.project_id!)
    );

    // Include node if:
    // 1. It's the root node
    // 2. It's a structural node (module, category)
    // 3. It's a budget node the user has access to
    // 4. It's a child of an accessible budget
    // 5. It's the Proyectos or Presupuestos module
    return nodes.filter(n => {
      // Root
      if (!n.parent_id) return true;
      // Module nodes that clients can see
      if (n.node_type === 'module' && (n.target_url === '/proyectos' || n.target_url === '/presupuestos')) return true;
      // Budget category nodes (Activos, En Ejecución, Archivados)
      if (['Activos', 'En Ejecución', 'Archivados'].includes(n.name)) return true;
      // Budget nodes the user has access to
      if (n.target_params?.budgetId && assignedBudgetIds.has(n.target_params.budgetId as string)) return true;
      // Sub-nodes of accessible budgets
      const findBudgetAncestor = (nodeId: string): boolean => {
        const node = nodes.find(nd => nd.id === nodeId);
        if (!node) return false;
        if (node.target_params?.budgetId && assignedBudgetIds.has(node.target_params.budgetId as string)) return true;
        if (node.parent_id) return findBudgetAncestor(node.parent_id);
        return false;
      };
      return findBudgetAncestor(n.id);
    });
  })();

  const activeNode = getActiveNode();
  const parent = activeNode ? getParent(activeNode.id) : null;
  const children = activeNode ? getChildren(activeNode.id).filter(c => visibleNodes.some(v => v.id === c.id)) : [];
  const siblings = activeNode ? getSiblings(activeNode.id).filter(s => visibleNodes.some(v => v.id === s.id)) : [];
  const breadcrumbs = getBreadcrumbs();

  const handleOpenPanel = useCallback((node: BrainNode) => {
    setPanelNode(node);
  }, []);

  const handleAddNode = async () => {
    if (!newNodeName.trim() || !activeNodeId) return;
    await addNode(activeNodeId, newNodeName.trim());
    setNewNodeName('');
    setShowAddDialog(false);
    toast.success('Nodo creado');
  };

  const filteredNodes = searchTerm
    ? visibleNodes.filter(n => n.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : [];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <p className="text-sm text-muted-foreground">Cargando Brain...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top Bar */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm px-4 py-2 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <BrainIcon className="h-5 w-5 text-primary" />
            <span className="font-semibold text-foreground hidden sm:inline">Brain</span>
          </div>

          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1 ml-2 text-sm">
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.id} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                <button
                  onClick={() => navigateTo(crumb.id)}
                  className={`hover:text-primary transition-colors ${
                    crumb.id === activeNodeId ? 'text-primary font-medium' : 'text-muted-foreground'
                  }`}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setShowSearch(!showSearch)}>
            <Search className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setShowAddDialog(true)} title="Añadir nota">
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost" size="icon"
            onClick={() => {
              const root = nodes.find(n => !n.parent_id);
              if (root) navigateTo(root.id);
            }}
            title="Ir al inicio"
          >
            <Home className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Search bar */}
      {showSearch && (
        <div className="px-4 py-2 border-b border-border bg-muted/30">
          <Input
            placeholder="Buscar nodos..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="max-w-md"
            autoFocus
          />
          {searchTerm && filteredNodes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1 max-h-32 overflow-auto">
              {filteredNodes.slice(0, 20).map(n => (
                <button
                  key={n.id}
                  onClick={() => { navigateTo(n.id); setShowSearch(false); setSearchTerm(''); }}
                  className="text-xs px-2 py-1 rounded-md bg-card border border-border hover:border-primary/40 transition-colors"
                >
                  {n.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Brain Plex View */}
      <main className="flex-1 relative">
        <BrainPlexView
          activeNode={activeNode}
          parent={parent}
          children={children}
          siblings={siblings}
          allNodes={nodes}
          onNavigate={(nodeId) => {
            const targetNode = nodes.find(n => n.id === nodeId);
            if (targetNode) {
              // If this node is a leaf (no children) with a target_url, navigate to that route
              const nodeChildren = nodes.filter(n => n.parent_id === nodeId);
              if (nodeChildren.length === 0 && targetNode.target_url) {
                navigate(targetNode.target_url);
                return;
              }
            }
            navigateTo(nodeId);
          }}
          onOpenPanel={handleOpenPanel}
        />
      </main>

      {/* Side Panel */}
      <BrainSidePanel
        node={panelNode}
        isAdmin={isAdmin()}
        onClose={() => setPanelNode(null)}
      />

      {/* Overlay when panel open */}
      {panelNode && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={() => setPanelNode(null)}
        />
      )}

      {/* Add Node Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Añadir nota a "{activeNode?.name}"</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              placeholder="Nombre del nodo..."
              value={newNodeName}
              onChange={e => setNewNodeName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddNode()}
              autoFocus
            />
            <Button onClick={handleAddNode} disabled={!newNodeName.trim()}>
              Crear
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
