import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, ChevronRight, ChevronDown, Brain, Trash2, Edit2, Check, X, HelpCircle } from 'lucide-react';
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

export function TolosaBrainstormView({ budgetId, isAdmin }: TolosaBrainstormViewProps) {
  const [items, setItems] = useState<TolosItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingParentId, setAddingParentId] = useState<string | null | 'root'>( null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

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

  // Build tree
  const rootItems = items.filter(i => !i.parent_id);
  const getChildren = (parentId: string) => items.filter(i => i.parent_id === parentId);

  // Generate next code for a level
  const getNextCode = (parentId: string | null) => {
    const siblings = parentId ? getChildren(parentId) : rootItems;
    const parentItem = parentId ? items.find(i => i.id === parentId) : null;
    const prefix = parentItem ? parentItem.code : '';
    
    // Find max code among siblings
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
      console.error('Error adding item:', error);
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
    
    const { error } = await supabase
      .from('tolosa_items')
      .delete()
      .eq('id', item.id);

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

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
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

    return (
      <div key={item.id} className="group">
        <div
          className={`flex items-start gap-2 p-3 rounded-lg border-l-4 ${getDepthColor(depth)} bg-card hover:bg-accent/30 transition-colors`}
          style={{ marginLeft: depth * 24 }}
        >
          {/* Expand/collapse */}
          <button
            onClick={() => hasChildren && toggleExpanded(item.id)}
            className={`mt-1 p-0.5 rounded ${hasChildren ? 'hover:bg-accent cursor-pointer' : 'invisible'}`}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="space-y-2">
                <Input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Nombre"
                  autoFocus
                />
                <Textarea
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  placeholder="Descripción"
                  rows={2}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleUpdate(item.id)}>
                    <Check className="h-3 w-3 mr-1" /> Guardar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    <X className="h-3 w-3 mr-1" /> Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs shrink-0">
                    {item.code}
                  </Badge>
                  <span className="font-medium text-foreground truncate">{item.name}</span>
                  {hasChildren && (
                    <Badge variant="secondary" className="text-xs">
                      {children.length}
                    </Badge>
                  )}
                </div>
                {item.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                )}
              </>
            )}
          </div>

          {/* Actions */}
          {!isEditing && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Añadir sub-QUÉ?"
                onClick={() => {
                  setAddingParentId(item.id);
                  setNewName('');
                  setNewDescription('');
                }}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => {
                  setEditingId(item.id);
                  setEditName(item.name);
                  setEditDescription(item.description || '');
                }}
              >
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => handleDelete(item)}
              >
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
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nombre del QUÉ?"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleAdd(item.id)}
            />
            <Textarea
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              placeholder="Descripción (opcional)"
              rows={2}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handleAdd(item.id)}>
                <Plus className="h-3 w-3 mr-1" /> Añadir
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAddingParentId(null)}>
                Cancelar
              </Button>
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
        <Button
          onClick={() => {
            setAddingParentId('root');
            setNewName('');
            setNewDescription('');
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Nuevo QUÉ?
        </Button>
      </div>

      {/* Root add form */}
      {addingParentId === 'root' && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">
              Nuevo QUÉ? raíz → <Badge variant="outline" className="font-mono text-xs">{getNextCode(null)}</Badge>
            </p>
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="¿QUÉ hay que hacer?"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleAdd(null)}
            />
            <Textarea
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              placeholder="Descripción (opcional)"
              rows={2}
            />
            <div className="flex gap-2">
              <Button onClick={() => handleAdd(null)}>
                <Plus className="h-4 w-4 mr-1" /> Añadir
              </Button>
              <Button variant="ghost" onClick={() => setAddingParentId(null)}>
                Cancelar
              </Button>
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
            <p className="text-muted-foreground mb-4">
              Empieza tu tormenta de ideas añadiendo el primer QUÉ?
            </p>
            <Button
              onClick={() => {
                setAddingParentId('root');
                setNewName('');
                setNewDescription('');
              }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Crear primer QUÉ?
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
