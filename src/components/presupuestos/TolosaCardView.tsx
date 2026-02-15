import { useState, useMemo, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Ruler, DollarSign, Users, MapPin, Wrench } from 'lucide-react';
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
}

// Distinct color palettes for sibling groups (parent-based)
const SIBLING_PALETTES = [
  { bg: 'bg-blue-50 dark:bg-blue-950/40', border: 'border-blue-300 dark:border-blue-700', accent: 'bg-blue-100 dark:bg-blue-900/60' },
  { bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-300 dark:border-emerald-700', accent: 'bg-emerald-100 dark:bg-emerald-900/60' },
  { bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-300 dark:border-amber-700', accent: 'bg-amber-100 dark:bg-amber-900/60' },
  { bg: 'bg-purple-50 dark:bg-purple-950/40', border: 'border-purple-300 dark:border-purple-700', accent: 'bg-purple-100 dark:bg-purple-900/60' },
  { bg: 'bg-rose-50 dark:bg-rose-950/40', border: 'border-rose-300 dark:border-rose-700', accent: 'bg-rose-100 dark:bg-rose-900/60' },
  { bg: 'bg-cyan-50 dark:bg-cyan-950/40', border: 'border-cyan-300 dark:border-cyan-700', accent: 'bg-cyan-100 dark:bg-cyan-900/60' },
  { bg: 'bg-orange-50 dark:bg-orange-950/40', border: 'border-orange-300 dark:border-orange-700', accent: 'bg-orange-100 dark:bg-orange-900/60' },
  { bg: 'bg-indigo-50 dark:bg-indigo-950/40', border: 'border-indigo-300 dark:border-indigo-700', accent: 'bg-indigo-100 dark:bg-indigo-900/60' },
];

export function TolosaCardView({
  items,
  itemSummaries,
  itemSubtotals,
  contactCache,
  getCuanto,
  onItemClick,
}: TolosaCardViewProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const getChildren = useCallback((parentId: string | null) => {
    return items
      .filter(i => i.parent_id === parentId)
      .sort((a, b) => a.order_index - b.order_index);
  }, [items]);

  const rootItems = useMemo(() => getChildren(null), [getChildren]);

  const toggleCollapse = (id: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Assign a color index to each parent group
  const parentColorMap = useMemo(() => {
    const map: Record<string, number> = {};
    // Root items each get their own color
    rootItems.forEach((item, idx) => {
      map[item.id] = idx % SIBLING_PALETTES.length;
    });
    // For nested items, inherit parent's color for the group
    const assignColors = (parentId: string, colorIdx: number) => {
      const children = getChildren(parentId);
      children.forEach((child) => {
        map[child.id] = colorIdx;
        assignColors(child.id, colorIdx);
      });
    };
    rootItems.forEach((item, idx) => {
      assignColors(item.id, idx % SIBLING_PALETTES.length);
    });
    return map;
  }, [rootItems, getChildren]);

  const renderCard = (item: TolosItem, depth: number = 0) => {
    const children = getChildren(item.id);
    const hasChildren = children.length > 0;
    const isCollapsed = collapsedIds.has(item.id);
    const summary = itemSummaries[item.id];
    const cuanto = getCuanto(item.id);
    const palette = SIBLING_PALETTES[parentColorMap[item.id] ?? 0];
    const clientName = item.client_contact_id ? contactCache[item.client_contact_id] : null;
    const hasLocation = !!(item.address_city || item.address_street);

    return (
      <div key={item.id} className="flex flex-col">
        {/* Card */}
        <div
          className={`rounded-xl border-2 ${palette.border} ${palette.bg} p-3 min-w-[220px] max-w-[340px] cursor-pointer hover:shadow-lg transition-all relative`}
          onClick={() => onItemClick?.(item.id)}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <Badge variant="outline" className="font-mono text-[10px] shrink-0 px-1.5">{item.code}</Badge>
                {hasChildren && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleCollapse(item.id); }}
                    className={`p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors`}
                    title={isCollapsed ? 'Expandir' : 'Colapsar'}
                  >
                    {isCollapsed
                      ? <ChevronRight className="h-3.5 w-3.5" />
                      : <ChevronDown className="h-3.5 w-3.5" />
                    }
                  </button>
                )}
              </div>
              <h4 className="text-sm font-semibold text-foreground leading-tight truncate">{item.name}</h4>
              {item.description && (
                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
              )}
            </div>
          </div>

          {/* Info badges */}
          <div className="flex flex-wrap gap-1 mt-2">
            {summary && summary.measurementUnits > 0 && (
              <Badge variant="outline" className="text-[9px] font-mono gap-0.5 px-1.5 py-0">
                <Ruler className="h-2.5 w-2.5" />
                {formatNumber(summary.measurementUnits)} {summary.measurementUnit}
              </Badge>
            )}
            {summary && summary.resourceSubtotal > 0 && (
              <Badge variant="secondary" className="text-[9px] font-mono gap-0.5 px-1.5 py-0">
                {formatCurrency(summary.resourceSubtotal)}
              </Badge>
            )}
            {cuanto > 0 && cuanto !== (summary?.resourceSubtotal || 0) && (
              <Badge className="text-[9px] font-mono gap-0.5 px-1.5 py-0 bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300 border-rose-300 dark:border-rose-700" variant="outline">
                <DollarSign className="h-2.5 w-2.5" />
                {formatCurrency(cuanto)}
              </Badge>
            )}
            {clientName && (
              <Badge variant="outline" className="text-[9px] gap-0.5 px-1.5 py-0">
                <Users className="h-2.5 w-2.5" />
                {clientName}
              </Badge>
            )}
            {hasLocation && (
              <Badge variant="outline" className="text-[9px] gap-0.5 px-1.5 py-0">
                <MapPin className="h-2.5 w-2.5" />
                {item.address_city || 'Ubicación'}
              </Badge>
            )}
            {hasChildren && (
              <Badge variant="outline" className="text-[9px] gap-0.5 px-1.5 py-0">
                {children.length} sub
              </Badge>
            )}
          </div>
        </div>

        {/* Children cards - horizontal flow with connecting line */}
        {hasChildren && !isCollapsed && (
          <div className="flex flex-col items-center mt-1">
            {/* Connector line */}
            <div className="w-px h-4 bg-border" />
            <div className="flex flex-wrap gap-3 justify-center pl-2 pr-2 relative">
              {/* Horizontal connector */}
              {children.length > 1 && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px bg-border" style={{ width: `calc(100% - 40px)` }} />
              )}
              {children.map(child => (
                <div key={child.id} className="flex flex-col items-center">
                  {children.length > 1 && <div className="w-px h-3 bg-border" />}
                  {renderCard(child, depth + 1)}
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
    <div className="overflow-x-auto pb-4">
      <div className="flex flex-wrap gap-6 justify-start items-start p-4 min-w-max">
        {rootItems.map(item => (
          <div key={item.id} className="flex flex-col items-center">
            {renderCard(item, 0)}
          </div>
        ))}
      </div>
    </div>
  );
}
