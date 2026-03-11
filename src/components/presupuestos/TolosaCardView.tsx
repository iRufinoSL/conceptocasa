import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronRight, Ruler, Users, MapPin, Minus, Plus, Edit2, Maximize2, Home, Check, X, ArrowRight, ArrowDown, Trash2, Copy } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/format-utils';

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
  address_street: string | null;
  address_city: string | null;
  address_postal_code: string | null;
  address_province: string | null;
  latitude: number | null;
  longitude: number | null;
  cadastral_reference: string | null;
  google_maps_url: string | null;
  client_contact_id: string | null;
  supplier_contact_id: string | null;
  housing_profile_id: string | null;
  is_executed?: boolean;
}

interface ItemSummary {
  measurementUnits: number;
  measurementUnit: string;
  resourceSubtotal: number;
}

interface TolosaCardViewProps {
  items: TolosItem[];
  itemSummaries: Record<string, ItemSummary>;
  itemSubtotals: Record<string, number>;
  contactCache: Record<string, string>;
  getCuanto: (itemId: string) => number;
  onItemClick?: (itemId: string) => void;
  onItemDoubleClick?: (itemId: string) => void;
  onEditItem?: (itemId: string) => void;
  onOpenFullDetail?: (itemId: string) => void;
  onUpdateItem?: (itemId: string, fields: { name?: string; code?: string }) => Promise<void>;
  onAddSibling?: (parentId: string | null, name: string) => void;
  onAddChild?: (parentId: string, name: string) => void;
  onDeleteItem?: (itemId: string) => void;
  onDuplicate?: (item: TolosItem, asSub: boolean) => void;
  initialFocusId?: string | null;
}

const SIBLING_PALETTES = [
  { bg: 'bg-blue-50 dark:bg-blue-950/40', border: 'border-blue-300 dark:border-blue-700', header: 'bg-blue-100 dark:bg-blue-900/60', line: '#93c5fd' },
  { bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-300 dark:border-emerald-700', header: 'bg-emerald-100 dark:bg-emerald-900/60', line: '#6ee7b7' },
  { bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-300 dark:border-amber-700', header: 'bg-amber-100 dark:bg-amber-900/60', line: '#fcd34d' },
  { bg: 'bg-purple-50 dark:bg-purple-950/40', border: 'border-purple-300 dark:border-purple-700', header: 'bg-purple-100 dark:bg-purple-900/60', line: '#c4b5fd' },
  { bg: 'bg-rose-50 dark:bg-rose-950/40', border: 'border-rose-300 dark:border-rose-700', header: 'bg-rose-100 dark:bg-rose-900/60', line: '#fda4af' },
  { bg: 'bg-cyan-50 dark:bg-cyan-950/40', border: 'border-cyan-300 dark:border-cyan-700', header: 'bg-cyan-100 dark:bg-cyan-900/60', line: '#67e8f9' },
  { bg: 'bg-orange-50 dark:bg-orange-950/40', border: 'border-orange-300 dark:border-orange-700', header: 'bg-orange-100 dark:bg-orange-900/60', line: '#fdba74' },
  { bg: 'bg-indigo-50 dark:bg-indigo-950/40', border: 'border-indigo-300 dark:border-indigo-700', header: 'bg-indigo-100 dark:bg-indigo-900/60', line: '#a5b4fc' },
];

export function TolosaCardView({
  items,
  itemSummaries,
  itemSubtotals,
  contactCache,
  getCuanto,
  onItemClick,
  onItemDoubleClick,
  onEditItem,
  onOpenFullDetail,
  onUpdateItem,
  onAddSibling,
  onAddChild,
  onDeleteItem,
  onDuplicate,
  initialFocusId,
}: TolosaCardViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [drillRootId, setDrillRootId] = useState<string | null>(null);

  // Inline editing state
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editCardName, setEditCardName] = useState('');
  const [editCardCode, setEditCardCode] = useState('');

  // Inline add state
  const [addingContext, setAddingContext] = useState<{ parentId: string | null; type: 'sibling' | 'child'; afterItemId?: string } | null>(null);
  const [addName, setAddName] = useState('');

  const getChildren = useCallback((parentId: string | null) => {
    return items
      .filter(i => i.parent_id === parentId)
      .sort((a, b) => a.order_index - b.order_index);
  }, [items]);

  const getAncestorChain = useCallback((itemId: string): TolosItem[] => {
    const chain: TolosItem[] = [];
    let current = items.find(i => i.id === itemId);
    while (current) {
      chain.unshift(current);
      current = current.parent_id ? items.find(i => i.id === current!.parent_id) : undefined;
    }
    return chain;
  }, [items]);

  const effectiveRoots = useMemo(() => {
    if (drillRootId) {
      const item = items.find(i => i.id === drillRootId);
      return item ? [item] : [];
    }
    return getChildren(null);
  }, [drillRootId, items, getChildren]);

  const itemDepth = useMemo(() => {
    const map: Record<string, number> = {};
    const computeDepth = (parentId: string | null, depth: number) => {
      getChildren(parentId).forEach(item => {
        map[item.id] = depth;
        computeDepth(item.id, depth + 1);
      });
    };
    if (drillRootId) {
      map[drillRootId] = 0;
      computeDepth(drillRootId, 1);
    } else {
      computeDepth(null, 0);
    }
    return map;
  }, [getChildren, drillRootId]);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const expanded = new Set<string>();
    items.forEach(item => {
      if ((itemDepth[item.id] ?? 0) < 2) {
        const children = getChildren(item.id);
        if (children.length > 0) {
          expanded.add(item.id);
        }
      }
    });
    return expanded;
  });

  useEffect(() => {
    if (drillRootId) {
      setExpandedIds(prev => {
        const next = new Set(prev);
        next.add(drillRootId);
        getChildren(drillRootId).forEach(child => {
          if (getChildren(child.id).length > 0) next.add(child.id);
        });
        return next;
      });
      setTimeout(() => containerRef.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' }), 50);
    }
  }, [drillRootId, getChildren]);

  useEffect(() => {
    if (initialFocusId) {
      setFocusedId(initialFocusId);
      const item = items.find(i => i.id === initialFocusId);
      if (item?.parent_id) {
        setExpandedIds(prev => {
          const next = new Set(prev);
          let current = item;
          while (current?.parent_id) {
            next.add(current.parent_id);
            current = items.find(i => i.id === current!.parent_id);
          }
          return next;
        });
      }
    }
  }, [initialFocusId, items]);

  const parentColorMap = useMemo(() => {
    const map: Record<string, number> = {};
    const allRoots = getChildren(null);
    allRoots.forEach((item, idx) => {
      map[item.id] = idx % SIBLING_PALETTES.length;
    });
    const assignColors = (parentId: string, colorIdx: number) => {
      getChildren(parentId).forEach((child) => {
        map[child.id] = colorIdx;
        assignColors(child.id, colorIdx);
      });
    };
    allRoots.forEach((item, idx) => {
      assignColors(item.id, idx % SIBLING_PALETTES.length);
    });
    return map;
  }, [getChildren]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!focusedId || !containerRef.current) return;
    const el = cardRefs.current[focusedId];
    if (el) {
      setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }, 150);
    }
  }, [focusedId, expandedIds, drillRootId]);

  const handleCardClick = useCallback((e: React.MouseEvent, item: TolosItem) => {
    const children = getChildren(item.id);
    if (children.length > 0) {
      // Single click toggles expand/collapse
      toggleExpand(item.id);
      setFocusedId(item.id);
    } else {
      onOpenFullDetail?.(item.id);
    }
  }, [getChildren, onOpenFullDetail, toggleExpand]);

  const startEditing = (item: TolosItem) => {
    setEditingCardId(item.id);
    setEditCardName(item.name);
    setEditCardCode(item.code);
  };

  const saveEditing = async () => {
    if (!editingCardId || !editCardName.trim()) return;
    if (onUpdateItem) {
      await onUpdateItem(editingCardId, { name: editCardName.trim(), code: editCardCode.trim() });
    }
    setEditingCardId(null);
  };

  const renderCard = (item: TolosItem) => {
    const children = getChildren(item.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(item.id);
    const summary = itemSummaries[item.id];
    const cuanto = getCuanto(item.id);
    const isEst = item.code?.includes('.E') || item.name?.includes('(Est.)');
    const palette = isEst
      ? { bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-400 dark:border-amber-600', header: 'bg-amber-100 dark:bg-amber-900/60', line: '#fbbf24' }
      : SIBLING_PALETTES[parentColorMap[item.id] ?? 0];
    const clientName = item.client_contact_id ? contactCache[item.client_contact_id] : null;
    const hasLocation = !!(item.address_city || item.address_street);
    const isFocused = focusedId === item.id;
    const isEditing = editingCardId === item.id;

    return (
      <div
        key={item.id}
        className="flex flex-col items-center"
        ref={el => { cardRefs.current[item.id] = el; }}
      >
        {/* The card itself */}
        <div
          className={`rounded-xl border-2 ${palette.border} ${palette.bg} min-w-[200px] max-w-[280px] cursor-pointer hover:shadow-lg transition-all relative select-none group/card ${isFocused ? 'ring-2 ring-primary shadow-lg' : ''}`}
          onClick={(e) => { if (!isEditing) handleCardClick(e, item); }}
          onDoubleClick={(e) => { if (!isEditing && hasChildren) { e.stopPropagation(); setDrillRootId(item.id); setFocusedId(item.id); } }}
        >
          {/* Header */}
          <div className={`flex items-center justify-between gap-1 px-2.5 py-1.5 rounded-t-[10px] ${palette.header}`}>
            {isEditing ? (
              <Input
                value={editCardCode}
                onChange={e => setEditCardCode(e.target.value)}
                className="h-5 text-[10px] font-mono w-16 px-1 py-0"
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <Badge variant="outline" className={`font-mono text-[10px] shrink-0 px-1.5 ${isEst ? 'bg-amber-200 text-amber-800 border-amber-400 dark:bg-amber-900/60 dark:text-amber-300 dark:border-amber-700' : 'bg-background/50'}`}>
                {isEst && <span className="mr-0.5">Est.</span>}{item.code}
              </Badge>
            )}
            <div className="flex items-center gap-0.5 ml-auto">
              {/* Quick-add sibling → */}
              {onAddSibling && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setAddingContext({ parentId: item.parent_id, type: 'sibling', afterItemId: item.id });
                    setAddName('');
                  }}
                  className="flex items-center px-1 py-0.5 rounded text-[10px] font-medium hover:bg-black/10 dark:hover:bg-white/10 transition-colors opacity-0 group-hover/card:opacity-60 hover:!opacity-100"
                  title="Crear hermano →"
                >
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
              {/* Quick-add child ↓ */}
              {onAddChild && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setAddingContext({ parentId: item.id, type: 'child' });
                    setAddName('');
                    setExpandedIds(prev => new Set(prev).add(item.id));
                  }}
                  className="flex items-center px-1 py-0.5 rounded text-[10px] font-medium hover:bg-black/10 dark:hover:bg-white/10 transition-colors opacity-0 group-hover/card:opacity-60 hover:!opacity-100"
                  title="Crear hijo ↓"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
              )}
              {onOpenFullDetail && (
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenFullDetail(item.id); }}
                  className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-medium hover:bg-black/10 dark:hover:bg-white/10 transition-colors opacity-60 hover:opacity-100"
                  title="Abrir detalle completo"
                >
                  <Maximize2 className="h-3 w-3" />
                </button>
              )}
              {onEditItem && !isEditing && (
                <button
                  onClick={(e) => { e.stopPropagation(); startEditing(item); }}
                  className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-medium hover:bg-black/10 dark:hover:bg-white/10 transition-colors opacity-60 hover:opacity-100"
                  title="Editar ActividadID"
                >
                  <Edit2 className="h-3 w-3" />
                </button>
              )}
              {/* Duplicate */}
              {onDuplicate && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDuplicate(item, false); }}
                  className="flex items-center px-1 py-0.5 rounded text-[10px] font-medium hover:bg-black/10 dark:hover:bg-white/10 transition-colors opacity-0 group-hover/card:opacity-60 hover:!opacity-100"
                  title="Duplicar"
                >
                  <Copy className="h-3 w-3" />
                </button>
              )}
              {/* Delete */}
              {onDeleteItem && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteItem(item.id); }}
                  className="flex items-center px-1 py-0.5 rounded text-[10px] font-medium hover:bg-red-200 dark:hover:bg-red-900/40 transition-colors opacity-0 group-hover/card:opacity-60 hover:!opacity-100 text-destructive"
                  title="Eliminar"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
              {hasChildren && (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleExpand(item.id); }}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                  title={isExpanded ? 'Colapsar hijos' : `Expandir (${children.length} hijos)`}
                >
                  {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <span>{children.length}</span>
                </button>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="px-2.5 py-2">
            {isEditing ? (
              <div className="space-y-1" onClick={e => e.stopPropagation()}>
                <Input
                  value={editCardName}
                  onChange={e => setEditCardName(e.target.value)}
                  className="h-7 text-xs"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') saveEditing(); if (e.key === 'Escape') setEditingCardId(null); }}
                />
                <div className="flex gap-1 justify-end">
                  <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px]" onClick={() => setEditingCardId(null)}>
                    <X className="h-2.5 w-2.5" />
                  </Button>
                  <Button size="sm" className="h-5 px-1.5 text-[10px]" onClick={saveEditing}>
                    <Check className="h-2.5 w-2.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <h4 className="text-xs font-semibold text-foreground leading-tight line-clamp-2">{item.name}</h4>
                {item.description && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{item.description}</p>
                )}
              </>
            )}

            {/* Badges */}
            {!isEditing && (
              <div className="flex flex-wrap gap-0.5 mt-1.5">
                {summary && summary.measurementUnits > 0 && (
                  <Badge variant="outline" className="text-[8px] font-mono gap-0.5 px-1 py-0">
                    <Ruler className="h-2 w-2" />
                    {formatNumber(summary.measurementUnits)} {summary.measurementUnit}
                  </Badge>
                )}
                {summary && summary.resourceSubtotal > 0 && (
                  <Badge variant="secondary" className="text-[8px] font-mono gap-0.5 px-1 py-0">
                    {formatCurrency(summary.resourceSubtotal)}
                  </Badge>
                )}
                {cuanto > 0 && cuanto !== (summary?.resourceSubtotal || 0) && (
                  <Badge className="text-[8px] font-mono gap-0.5 px-1 py-0 bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300 border-rose-300 dark:border-rose-700" variant="outline">
                    {formatCurrency(cuanto)}
                  </Badge>
                )}
                {clientName && (
                  <Badge variant="outline" className="text-[8px] gap-0.5 px-1 py-0">
                    <Users className="h-2 w-2" />
                    {clientName}
                  </Badge>
                )}
                {hasLocation && (
                  <Badge variant="outline" className="text-[8px] gap-0.5 px-1 py-0">
                    <MapPin className="h-2 w-2" />
                    {item.address_city || 'Loc'}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Children with SVG connectors */}
        {hasChildren && isExpanded && (
          <div className="flex flex-col items-center mt-0">
            <svg width="2" height="24" className="shrink-0">
              <line x1="1" y1="0" x2="1" y2="24" stroke={palette.line} strokeWidth="2" />
            </svg>
            <div className="relative flex gap-4 items-start">
              {children.length > 1 && (
                <div className="absolute top-0 left-0 right-0 h-0 pointer-events-none" style={{ zIndex: 0 }}>
                  <svg width="100%" height="2" className="absolute top-0 left-0 w-full">
                    <line x1="0" y1="1" x2="100%" y2="1" stroke={palette.line} strokeWidth="2" />
                  </svg>
                </div>
              )}
              {children.map((child) => (
                <div key={child.id} className="flex flex-col items-center relative">
                  <svg width="2" height="16" className="shrink-0">
                    <line x1="1" y1="0" x2="1" y2="16" stroke={palette.line} strokeWidth="2" />
                  </svg>
                  {renderCard(child)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (items.length === 0) return null;

  const breadcrumb = drillRootId ? getAncestorChain(drillRootId) : [];

  return (
    <div className="space-y-2">
      {/* Breadcrumb when drilled down */}
      {drillRootId && (
        <div className="flex items-center gap-1 flex-wrap px-2 py-1.5 bg-muted/50 rounded-lg border">
          <button
            onClick={() => { setDrillRootId(null); setFocusedId(null); }}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            title="Volver a la vista raíz"
          >
            <Home className="h-3 w-3" />
            Raíz
          </button>
          {breadcrumb.map((ancestor, idx) => {
            const isLast = idx === breadcrumb.length - 1;
            return (
              <span key={ancestor.id} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                {isLast ? (
                  <span className="text-xs font-semibold text-foreground">{ancestor.code} {ancestor.name}</span>
                ) : (
                  <button
                    onClick={() => { setDrillRootId(ancestor.id); setFocusedId(ancestor.id); }}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {ancestor.code} {ancestor.name}
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* Inline add form */}
      {addingContext && (
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg border">
          <span className="text-xs text-muted-foreground shrink-0">
            {addingContext.type === 'sibling' ? 'Nuevo hermano →' : 'Nuevo hijo ↓'}
          </span>
          <Input
            value={addName}
            onChange={e => setAddName(e.target.value)}
            placeholder="Nombre del nuevo QUÉ?"
            className="h-7 text-xs flex-1"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter' && addName.trim()) {
                if (addingContext.type === 'sibling') {
                  onAddSibling?.(addingContext.parentId, addName.trim());
                } else {
                  onAddChild?.(addingContext.parentId!, addName.trim());
                }
                setAddName('');
                setAddingContext(null);
              }
              if (e.key === 'Escape') setAddingContext(null);
            }}
          />
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={!addName.trim()}
            onClick={() => {
              if (!addName.trim()) return;
              if (addingContext.type === 'sibling') {
                onAddSibling?.(addingContext.parentId, addName.trim());
              } else {
                onAddChild?.(addingContext.parentId!, addName.trim());
              }
              setAddName('');
              setAddingContext(null);
            }}
          >
            <Plus className="h-3 w-3 mr-1" /> Añadir
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddingContext(null)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      <div ref={containerRef} className="overflow-auto pb-4 max-h-[75vh]">
        <div className="flex gap-6 items-start p-4 min-w-min">
          {effectiveRoots.map(item => renderCard(item))}
        </div>
      </div>
    </div>
  );
}
