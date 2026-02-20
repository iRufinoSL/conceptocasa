import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Ruler, DollarSign, Users, MapPin, Minus, Plus, Edit2 } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/format-utils';
import { Button } from '@/components/ui/button';

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
}: TolosaCardViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const getChildren = useCallback((parentId: string | null) => {
    return items
      .filter(i => i.parent_id === parentId)
      .sort((a, b) => a.order_index - b.order_index);
  }, [items]);

  const rootItems = useMemo(() => getChildren(null), [getChildren]);

  // Compute depth of each item
  const itemDepth = useMemo(() => {
    const map: Record<string, number> = {};
    const computeDepth = (parentId: string | null, depth: number) => {
      getChildren(parentId).forEach(item => {
        map[item.id] = depth;
        computeDepth(item.id, depth + 1);
      });
    };
    computeDepth(null, 0);
    return map;
  }, [getChildren]);

  // By default collapse items deeper than level 1 (show 2 levels: 0 and 1)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const expanded = new Set<string>();
    // Expand root items (depth 0) so their children (depth 1) are visible
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

  // Color assignment
  const parentColorMap = useMemo(() => {
    const map: Record<string, number> = {};
    rootItems.forEach((item, idx) => {
      map[item.id] = idx % SIBLING_PALETTES.length;
    });
    const assignColors = (parentId: string, colorIdx: number) => {
      getChildren(parentId).forEach((child) => {
        map[child.id] = colorIdx;
        assignColors(child.id, colorIdx);
      });
    };
    rootItems.forEach((item, idx) => {
      assignColors(item.id, idx % SIBLING_PALETTES.length);
    });
    return map;
  }, [rootItems, getChildren]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        // Collapsing: focus parent
        next.delete(id);
        const item = items.find(i => i.id === id);
        setFocusedId(item?.parent_id || id);
      } else {
        next.add(id);
        setFocusedId(id);
      }
      return next;
    });
  }, [items]);

  // Auto-scroll focused card to top-left
  useEffect(() => {
    if (!focusedId || !containerRef.current) return;
    const el = cardRefs.current[focusedId];
    if (el) {
      setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'start' });
      }, 100);
    }
  }, [focusedId, expandedIds]);

  // Get ancestors for path display
  const getAncestorPath = useCallback((itemId: string): string[] => {
    const path: string[] = [];
    let current = items.find(i => i.id === itemId);
    while (current?.parent_id) {
      const parent = items.find(i => i.id === current!.parent_id);
      if (parent) {
        path.unshift(parent.name);
        current = parent;
      } else break;
    }
    return path;
  }, [items]);

  const handleDoubleClick = useCallback((e: React.MouseEvent, itemId: string) => {
    e.preventDefault();
    e.stopPropagation();
    onItemDoubleClick?.(itemId);
  }, [onItemDoubleClick]);

  const handleSingleClick = useCallback((itemId: string) => {
    onItemClick?.(itemId);
  }, [onItemClick]);

  const renderCard = (item: TolosItem) => {
    const children = getChildren(item.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(item.id);
    const summary = itemSummaries[item.id];
    const cuanto = getCuanto(item.id);
    const palette = SIBLING_PALETTES[parentColorMap[item.id] ?? 0];
    const clientName = item.client_contact_id ? contactCache[item.client_contact_id] : null;
    const hasLocation = !!(item.address_city || item.address_street);

    return (
      <div
        key={item.id}
        className="flex flex-col items-center"
        ref={el => { cardRefs.current[item.id] = el; }}
      >
        {/* The card itself */}
        <div
          className={`rounded-xl border-2 ${palette.border} ${palette.bg} min-w-[200px] max-w-[280px] cursor-pointer hover:shadow-lg transition-all relative select-none`}
          onClick={() => handleSingleClick(item.id)}
          onDoubleClick={(e) => handleDoubleClick(e, item.id)}
        >
          {/* Header with code + expand/collapse + edit button */}
          <div className={`flex items-center justify-between gap-1 px-2.5 py-1.5 rounded-t-[10px] ${palette.header}`}>
            <Badge variant="outline" className="font-mono text-[10px] shrink-0 px-1.5 bg-background/50">{item.code}</Badge>
            <div className="flex items-center gap-0.5 ml-auto">
              {onEditItem && (
                <button
                  onClick={(e) => { e.stopPropagation(); onEditItem(item.id); }}
                  className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-medium hover:bg-black/10 dark:hover:bg-white/10 transition-colors opacity-60 hover:opacity-100"
                  title="Abrir formulario de este QUÉ?"
                >
                  <Edit2 className="h-3 w-3" />
                </button>
              )}
              {hasChildren && (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleExpand(item.id); }}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                  title={isExpanded ? 'Colapsar hijos' : `Expandir (${children.length} hijos)`}
                >
                  {isExpanded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                  <span>{children.length}</span>
                </button>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="px-2.5 py-2">
            <h4 className="text-xs font-semibold text-foreground leading-tight line-clamp-2">{item.name}</h4>
            {item.description && (
              <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{item.description}</p>
            )}

            {/* Badges */}
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
                  <DollarSign className="h-2 w-2" />
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
          </div>
        </div>

        {/* Children with SVG connectors */}
        {hasChildren && isExpanded && (
          <div className="flex flex-col items-center mt-0">
            {/* Vertical line from parent to horizontal bar */}
            <svg width="2" height="24" className="shrink-0">
              <line x1="1" y1="0" x2="1" y2="24" stroke={palette.line} strokeWidth="2" />
            </svg>
            <div className="relative flex gap-4 items-start">
              {/* Horizontal connector bar (SVG overlay) */}
              {children.length > 1 && (
                <div className="absolute top-0 left-0 right-0 h-0 pointer-events-none" style={{ zIndex: 0 }}>
                  <svg width="100%" height="2" className="absolute top-0 left-0 w-full">
                    <line x1="0" y1="1" x2="100%" y2="1" stroke={palette.line} strokeWidth="2" />
                  </svg>
                </div>
              )}
              {children.map((child) => (
                <div key={child.id} className="flex flex-col items-center relative">
                  {/* Vertical connector from horizontal bar to child card */}
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

  return (
    <div ref={containerRef} className="overflow-auto pb-4 max-h-[75vh]">
      <div className="flex gap-6 items-start p-4 min-w-min">
        {rootItems.map(item => renderCard(item))}
      </div>
    </div>
  );
}
