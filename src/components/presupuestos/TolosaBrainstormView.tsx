import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Plus, ChevronRight, ChevronDown, Brain, Trash2, Edit2, Check, X,
  HelpCircle, Copy, Wrench, Users, MapPin, Clock, DollarSign
} from 'lucide-react';
import { toast } from 'sonner';

interface TolosItem {
  id: string;
  budget_id: string;
  parent_id: string | null;
  code: string;
  name: string;
  description: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

interface TolosaBrainstormViewProps {
  budgetId: string;
  isAdmin: boolean;
}

const DIMENSION_LINKS = [
  { key: 'como', label: 'CÓMO?', icon: Wrench, color: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950 dark:border-blue-800', hint: 'Actividades' },
  { key: 'quien', label: 'QUIÉN?', icon: Users, color: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950 dark:border-emerald-800', hint: 'Contactos' },
  { key: 'donde', label: 'DÓNDE?', icon: MapPin, color: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950 dark:border-amber-800', hint: 'Zonas de trabajo' },
  { key: 'cuando', label: 'CUÁNDO?', icon: Clock, color: 'text-purple-600 bg-purple-50 border-purple-200 dark:text-purple-400 dark:bg-purple-950 dark:border-purple-800', hint: 'Fases / Plazos' },
  { key: 'cuanto', label: 'CUÁNTO?', icon: DollarSign, color: 'text-rose-600 bg-rose-50 border-rose-200 dark:text-rose-400 dark:bg-rose-950 dark:border-rose-800', hint: 'Recursos / Costes' },
];

export function TolosaBrainstormView({ budgetId, isAdmin }: TolosaBrainstormViewProps) {
  const [items, setItems] = useState<TolosItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingParentId, setAddingParentId] = useState<string | null | 'root'>(null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [detailOpenIds, setDetailOpenIds] = useState<Set<string>>(new Set());

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('tolosa_items')
      .select('*')
      .eq('budget_id', budgetId)
      .order('code', { ascending: true });

    if (error) {
      console.error('Error fetching tolosa items:', error);
      toast.error('Error al cargar ítems');
    } else {
      setItems(data || []);
    }
    setLoading(false);
  }, [budgetId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const rootItems = items.filter(i => !i.parent_id);
  const getChildren = (parentId: string) => items.filter(i => i.parent_id === parentId);

  const getNextCode = (parentId: string | null) => {
    const siblings = parentId ? getChildren(parentId) : rootItems;
    const parentItem = parentId ? items.find(i => i.id === parentId) : null;
    const prefix = parentItem ? parentItem.code : '';
    let maxNum = 0;
    siblings.forEach(s => {
      const suffix = s.code.slice(prefix.length);
      const num = parseInt(suffix, 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    });
    return prefix + String(maxNum + 1).padStart(3, '0');
  };

  const handleAdd = async (parentId: string | null) => {
    if (!newName.trim()) return;
    const code = getNextCode(parentId);
    const siblings = parentId ? getChildren(parentId) : rootItems;
    const { error } = await supabase
      .from('tolosa_items')
      .insert({
        budget_id: budgetId,
        parent_id: parentId,
        code,
        name: newName.trim(),
        description: newDescription.trim() || null,
        order_index: siblings.length,
      });
    if (error) {
      toast.error('Error al añadir ítem');
    } else {
      toast.success('QUÉ? añadido');
      setNewName('');
      setNewDescription('');
      setAddingParentId(null);
      if (parentId) setExpandedIds(prev => new Set(prev).add(parentId));
      fetchItems();
    }
  };

  const handleDelete = async (item: TolosItem) => {
    const children = getChildren(item.id);
    if (children.length > 0) {
      toast.error('Elimina primero los sub-QUÉ?');
      return;
    }
    const { error } = await supabase.from('tolosa_items').delete().eq('id', item.id);
    if (error) {
      toast.error('Error al eliminar');
    } else {
      toast.success('Eliminado');
      fetchItems();
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    const { error } = await supabase
      .from('tolosa_items')
      .update({ name: editName.trim(), description: editDescription.trim() || null })
      .eq('id', id);
    if (error) {
      toast.error('Error al actualizar');
    } else {
      setEditingId(null);
      fetchItems();
    }
  };

  // Duplicate an item (and optionally all descendants) as sibling or as sub-item
  const duplicateItem = async (item: TolosItem, asSub: boolean) => {
    const targetParentId = asSub ? item.id : item.parent_id;
    const code = getNextCode(targetParentId);
    const siblings = targetParentId ? getChildren(targetParentId) : rootItems;

    const { data: newItem, error } = await supabase
      .from('tolosa_items')
      .insert({
        budget_id: budgetId,
        parent_id: targetParentId,
        code,
        name: item.name + ' (copia)',
        description: item.description,
        order_index: siblings.length,
      })
      .select()
      .single();

    if (error || !newItem) {
      toast.error('Error al duplicar');
      return;
    }

    // Recursively duplicate children
    const children = getChildren(item.id);
    if (children.length > 0) {
      await duplicateChildren(children, newItem.id, newItem.code);
    }

    toast.success(asSub ? 'Duplicado como sub-QUÉ?' : 'QUÉ? duplicado');
    if (targetParentId) setExpandedIds(prev => new Set(prev).add(targetParentId));
    fetchItems();
  };

  const duplicateChildren = async (children: TolosItem[], newParentId: string, parentCode: string) => {
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childCode = parentCode + String(i + 1).padStart(3, '0');
      const { data: newChild, error } = await supabase
        .from('tolosa_items')
        .insert({
          budget_id: budgetId,
          parent_id: newParentId,
          code: childCode,
          name: child.name,
          description: child.description,
          order_index: i,
        })
        .select()
        .single();

      if (!error && newChild) {
        const grandChildren = getChildren(child.id);
        if (grandChildren.length > 0) {
          await duplicateChildren(grandChildren, newChild.id, newChild.code);
        }
      }
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleDetail = (id: string) => {
    setDetailOpenIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getDepthColor = (depth: number) => {
    const colors = [
      'border-l-primary',
      'border-l-blue-500',
      'border-l-emerald-500',
      'border-l-amber-500',
      'border-l-purple-500',
      'border-l-rose-500',
    ];
    return colors[depth % colors.length];
  };

  const renderItem = (item: TolosItem, depth: number = 0) => {
    const children = getChildren(item.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(item.id);
    const isEditing = editingId === item.id;
    const isAddingSub = addingParentId === item.id;
    const isDetailOpen = detailOpenIds.has(item.id);
    const queId = `${item.code} ${item.name}`;

    return (
      <div key={item.id} className="group/item">
        <div
          className={`flex items-start gap-2 p-3 rounded-lg border-l-4 ${getDepthColor(depth)} bg-card hover:bg-accent/30 transition-colors`}
          style={{ marginLeft: depth * 24 }}
        >
          {/* Expand/collapse children */}
          <button
            onClick={() => hasChildren && toggleExpanded(item.id)}
            className={`mt-1 p-0.5 rounded ${hasChildren ? 'hover:bg-accent cursor-pointer' : 'invisible'}`}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="space-y-2">
                <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nombre" autoFocus />
                <Textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="Descripción" rows={2} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleUpdate(item.id)}><Check className="h-3 w-3 mr-1" /> Guardar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-3 w-3 mr-1" /> Cancelar</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs shrink-0">{item.code}</Badge>
                  <button
                    onClick={() => toggleDetail(item.id)}
                    className="font-medium text-foreground truncate hover:underline text-left"
                  >
                    {item.name}
                  </button>
                  {hasChildren && (
                    <Badge variant="secondary" className="text-xs">{children.length}</Badge>
                  )}
                </div>
                {item.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                )}

                {/* Dimension links panel */}
                {isDetailOpen && (
                  <div className="mt-3 space-y-3">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      QUÉ?id: {queId}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                      {DIMENSION_LINKS.map(dim => {
                        const Icon = dim.icon;
                        return (
                          <button
                            key={dim.key}
                            className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-center transition-all hover:shadow-md hover:scale-[1.02] ${dim.color}`}
                            onClick={() => toast.info(`${dim.label} — Vinculación próximamente`)}
                          >
                            <Icon className="h-5 w-5" />
                            <span className="text-xs font-bold">{dim.label}</span>
                            <span className="text-[10px] opacity-70">{dim.hint}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Actions */}
          {!isEditing && (
            <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0">
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Añadir sub-QUÉ?"
                onClick={() => { setAddingParentId(item.id); setNewName(''); setNewDescription(''); }}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Duplicar como QUÉ?"
                onClick={() => duplicateItem(item, false)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Duplicar como sub-QUÉ?"
                onClick={() => duplicateItem(item, true)}>
                <Plus className="h-3 w-3" /><Copy className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7"
                onClick={() => { setEditingId(item.id); setEditName(item.name); setEditDescription(item.description || ''); }}>
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => handleDelete(item)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Inline add sub-item form */}
        {isAddingSub && (
          <div className="mt-2 p-3 border rounded-lg bg-muted/30 space-y-2" style={{ marginLeft: (depth + 1) * 24 }}>
            <p className="text-xs font-medium text-muted-foreground">
              Nuevo sub-QUÉ? de <span className="text-foreground">{item.code} {item.name}</span>
              {' → '}<Badge variant="outline" className="font-mono text-xs">{getNextCode(item.id)}</Badge>
            </p>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre del QUÉ?" autoFocus
              onKeyDown={e => e.key === 'Enter' && handleAdd(item.id)} />
            <Textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Descripción (opcional)" rows={2} />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handleAdd(item.id)}><Plus className="h-3 w-3 mr-1" /> Añadir</Button>
              <Button size="sm" variant="ghost" onClick={() => setAddingParentId(null)}>Cancelar</Button>
            </div>
          </div>
        )}

        {/* Children */}
        {hasChildren && isExpanded && (
          <div className="mt-1 space-y-1">
            {children.map(child => renderItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Brain className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">TO.LO.SA.system 2.0</h2>
            <p className="text-sm text-muted-foreground">Brainstorming — ¿QUÉ hay que hacer?</p>
          </div>
        </div>
        <Button onClick={() => { setAddingParentId('root'); setNewName(''); setNewDescription(''); }} className="gap-2">
          <Plus className="h-4 w-4" /> Nuevo QUÉ?
        </Button>
      </div>

      {/* Dimension legend */}
      <div className="flex flex-wrap gap-2">
        {DIMENSION_LINKS.map(dim => {
          const Icon = dim.icon;
          return (
            <Badge key={dim.key} variant="outline" className={`gap-1 ${dim.color}`}>
              <Icon className="h-3 w-3" /> {dim.label}
            </Badge>
          );
        })}
      </div>

      {/* Root add form */}
      {addingParentId === 'root' && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">
              Nuevo QUÉ? raíz → <Badge variant="outline" className="font-mono text-xs">{getNextCode(null)}</Badge>
            </p>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="¿QUÉ hay que hacer?" autoFocus
              onKeyDown={e => e.key === 'Enter' && handleAdd(null)} />
            <Textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Descripción (opcional)" rows={2} />
            <div className="flex gap-2">
              <Button onClick={() => handleAdd(null)}><Plus className="h-4 w-4 mr-1" /> Añadir</Button>
              <Button variant="ghost" onClick={() => setAddingParentId(null)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Items tree */}
      {rootItems.length === 0 && addingParentId !== 'root' ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <HelpCircle className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">¿QUÉ hay que hacer?</h3>
            <p className="text-muted-foreground mb-4">Empieza tu tormenta de ideas añadiendo el primer QUÉ?</p>
            <Button onClick={() => { setAddingParentId('root'); setNewName(''); setNewDescription(''); }} className="gap-2">
              <Plus className="h-4 w-4" /> Crear primer QUÉ?
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1">
          {rootItems.map(item => renderItem(item, 0))}
        </div>
      )}

      {/* Summary */}
      {items.length > 0 && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground border-t pt-4">
          <span>{items.length} ítems totales</span>
          <span>{rootItems.length} QUÉ? raíz</span>
          <span>{items.length - rootItems.length} sub-QUÉ?</span>
        </div>
      )}
    </div>
  );
}
