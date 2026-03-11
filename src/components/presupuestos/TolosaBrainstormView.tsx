import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Plus, ChevronRight, ChevronDown, Brain, Trash2, Edit2, Check, X,
  HelpCircle, Copy, Wrench, Users, MapPin, Clock, DollarSign,
  ExternalLink, Building, User, Truck, FileText, Link, Unlink,
  Home, Ruler, Layers, Landmark, PenTool, RulerIcon, FolderOpen,
  CalendarDays, MessageSquare, Calculator, BarChart3, Timer, Settings,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, List, LayoutGrid, ShoppingCart, Eye,
  ArrowLeftCircle, Search
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { TolosaCardView } from './TolosaCardView';
import { BudgetUrbanismTab } from './BudgetUrbanismTab';
import { BudgetMeasurementsTab } from './BudgetMeasurementsTab';
import { TolosaMeasurementsPanel } from './TolosaMeasurementsPanel';
import { TolosaResourcesPanel } from './TolosaResourcesPanel';
import { EstimationResourceForm } from './EstimationResourceForm';
import { BudgetAgendaTab } from './BudgetAgendaTab';
import { BuyingListUnified } from './BuyingListUnified';
import { BudgetAdministracionTab } from './BudgetAdministracionTab';
import { BudgetSpacesTab } from './BudgetSpacesTab';
import { FloorPlanTab } from './FloorPlanTab';
import { BudgetPredesignTab } from './BudgetPredesignTab';
import { BudgetDocumentsTab } from './BudgetDocumentsTab';
import { BudgetCommunicationsTab } from './BudgetCommunicationsTab';
import { BudgetVisualSummary } from './BudgetVisualSummary';
import { HierarchicalGanttView } from './HierarchicalGanttView';
import { BudgetTimelineView } from './BudgetTimelineView';
import { BudgetVersionComparison } from './BudgetVersionComparison';
import { BudgetContactsManager } from './BudgetContactsManager';
import { BudgetWorkAreasTab } from './BudgetWorkAreasTab';
import { SpaceDetail } from './HousingProfileEditor';
import { Json } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { formatCurrency, formatNumber } from '@/lib/format-utils';
import { calcResourceSubtotal } from '@/lib/budget-pricing';

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
  is_executed: boolean;
  phase_id: string | null;
}

interface PhaseInfo {
  id: string;
  code: string | null;
  name: string;
  start_date: string | null;
}

interface ContactInfo {
  id: string;
  name: string;
  surname: string | null;
  email: string | null;
  phone: string | null;
}

interface ProfileInfo {
  id: string;
  contact_name: string;
  contact_email: string;
  poblacion: string | null;
  created_at: string;
  project_id: string;
}

interface FullProfileData {
  id: string;
  contact_name: string;
  contact_email: string;
  poblacion: string | null;
  num_plantas: string | null;
  m2_por_planta: string | null;
  num_habitaciones_total: string | null;
  num_banos_total: string | null;
  tipo_salon: string | null;
  tipo_cocina: string | null;
  lavanderia: string | null;
  despensa: string | null;
  garaje: string | null;
  porche_cubierto: string | null;
  patio_descubierto: string | null;
  presupuesto_global: string | null;
  espacios_detalle: Json | null;
  altura_habitaciones: number | null;
}

interface TolosaBrainstormViewProps {
  budgetId: string;
  isAdmin: boolean;
}

const DIMENSION_LINKS = [
  { key: 'como', label: 'CÓMO?', icon: Wrench, color: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950 dark:border-blue-800', hint: 'Actividades / Perfil' },
  { key: 'quien', label: 'QUIÉN?', icon: Users, color: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950 dark:border-emerald-800', hint: 'Cliente / Proveedor' },
  { key: 'donde', label: 'DÓNDE?', icon: MapPin, color: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950 dark:border-amber-800', hint: 'Dirección / Catastro' },
  { key: 'cuando', label: 'CUÁNDO?', icon: Clock, color: 'text-purple-600 bg-purple-50 border-purple-200 dark:text-purple-400 dark:bg-purple-950 dark:border-purple-800', hint: 'Fases / Plazos' },
  { key: 'cuanto', label: 'CUÁNTO?', icon: DollarSign, color: 'text-rose-600 bg-rose-50 border-rose-200 dark:text-rose-400 dark:bg-rose-950 dark:border-rose-800', hint: 'Costes / SubTotal' },
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
  const [activeDimension, setActiveDimension] = useState<Record<string, string>>({});
  const [contacts, setContacts] = useState<ContactInfo[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [contactCache, setContactCache] = useState<Record<string, string>>({});
  const [housingProfiles, setHousingProfiles] = useState<ProfileInfo[]>([]);
  const [profileSearch, setProfileSearch] = useState('');
  const [showProfilePicker, setShowProfilePicker] = useState<string | null>(null);
  const [profileCache, setProfileCache] = useState<Record<string, FullProfileData>>({});
  const [dondeForm, setDondeForm] = useState<Record<string, {
    address_street: string;
    address_city: string;
    address_postal_code: string;
    address_province: string;
    latitude: string;
    longitude: string;
    google_maps_url: string;
    cadastral_reference: string;
  }>>({});
  const [dondeLocationOpen, setDondeLocationOpen] = useState<Record<string, boolean>>({});
  const [itemSubtotals, setItemSubtotals] = useState<Record<string, number>>({});
  const [itemSubtotalsNormal, setItemSubtotalsNormal] = useState<Record<string, number>>({});
  const [itemSubtotalsEst, setItemSubtotalsEst] = useState<Record<string, number>>({});
  const [itemSummaries, setItemSummaries] = useState<Record<string, { measurementUnits: number; measurementUnit: string; resourceSubtotal: number; normalSubtotal: number; estSubtotal: number }>>({});
  const [viewMode, setViewMode] = useState<'list' | 'cards'>('list');
  const [showOnlyExecuted, setShowOnlyExecuted] = useState(true);
  const [graphEntryItemId, setGraphEntryItemId] = useState<string | null>(null); // tracks item opened from graph card ✏️
  const [measurementVersions, setMeasurementVersions] = useState<Record<string, number>>({});
  const [fullDetailItemId, setFullDetailItemId] = useState<string | null>(null);
  const [lastWorkedItemId, setLastWorkedItemId] = useState<string | null>(null);
  const [previousViewMode, setPreviousViewMode] = useState<'list' | 'cards' | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ item: TolosItem; descendants: TolosItem[] } | null>(null);
  const [graphAddName, setGraphAddName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [cuandoListOpen, setCuandoListOpen] = useState(false);
  const [cuandoFilter, setCuandoFilter] = useState<'all' | 'normal' | 'estimacion'>('all');

  const [phases, setPhases] = useState<PhaseInfo[]>([]);
  // Duplicate dialog state
  const [dupDialogOpen, setDupDialogOpen] = useState(false);
  const [dupItem, setDupItem] = useState<TolosItem | null>(null);
  const [dupAsSub, setDupAsSub] = useState(false);
  const [dupType, setDupType] = useState<'normal' | 'estimacion'>('normal');
  const [dupName, setDupName] = useState('');
  const [dupUnits, setDupUnits] = useState('1');
  const [dupUnitPrice, setDupUnitPrice] = useState('');
  const [dupVatPercent, setDupVatPercent] = useState('21');

  const fetchPhases = useCallback(async () => {
    const { data } = await supabase
      .from('budget_phases')
      .select('id, code, name, start_date')
      .eq('budget_id', budgetId)
      .order('order_index');
    setPhases((data as PhaseInfo[]) || []);
  }, [budgetId]);

  const bumpMeasurementVersion = useCallback((itemId: string) => {
    setMeasurementVersions(prev => ({ ...prev, [itemId]: (prev[itemId] || 0) + 1 }));
  }, []);
  const updateItemSubtotal = useCallback((itemId: string, subtotal: number) => {
    setItemSubtotals(prev => {
      if (prev[itemId] === subtotal) return prev;
      return { ...prev, [itemId]: subtotal };
    });
  }, []);
  const updateItemSubtotalSplit = useCallback((itemId: string, normal: number, est: number) => {
    setItemSubtotalsNormal(prev => {
      if (prev[itemId] === normal) return prev;
      return { ...prev, [itemId]: normal };
    });
    setItemSubtotalsEst(prev => {
      if (prev[itemId] === est) return prev;
      return { ...prev, [itemId]: est };
    });
  }, []);

  // Calculate CUÁNTO? for an item: own subtotal + all descendants' subtotals
  const getCuanto = useCallback((itemId: string): number => {
    const own = itemSubtotals[itemId] || 0;
    const children = items.filter(i => i.parent_id === itemId);
    const childrenTotal = children.reduce((sum, child) => sum + getCuanto(child.id), 0);
    return own + childrenTotal;
  }, [items, itemSubtotals]);

  const getCuantoNormal = useCallback((itemId: string): number => {
    const own = itemSubtotalsNormal[itemId] || 0;
    const children = items.filter(i => i.parent_id === itemId);
    const childrenTotal = children.reduce((sum, child) => sum + getCuantoNormal(child.id), 0);
    return own + childrenTotal;
  }, [items, itemSubtotalsNormal]);

  const getCuantoEst = useCallback((itemId: string): number => {
    const own = itemSubtotalsEst[itemId] || 0;
    const children = items.filter(i => i.parent_id === itemId);
    const childrenTotal = children.reduce((sum, child) => sum + getCuantoEst(child.id), 0);
    return own + childrenTotal;
  }, [items, itemSubtotalsEst]);

  // Bulk fetch measurement + resource summaries for all items
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const fetchItemSummaries = useCallback(async () => {
    const currentItems = itemsRef.current;
    if (currentItems.length === 0) return;
    const itemIds = currentItems.map(i => i.id);

    try {
      // 1. Fetch all tolosa_item_measurements links
      const { data: allMeasLinks, error: measLinksErr } = await supabase
        .from('tolosa_item_measurements')
        .select('tolosa_item_id, measurement_id')
        .in('tolosa_item_id', itemIds);
      if (measLinksErr) { console.error('fetchItemSummaries measLinks error:', measLinksErr); return; }

      const measLinksByItem: Record<string, string[]> = {};
      (allMeasLinks || []).forEach((l: any) => {
        if (!measLinksByItem[l.tolosa_item_id]) measLinksByItem[l.tolosa_item_id] = [];
        measLinksByItem[l.tolosa_item_id].push(l.measurement_id);
      });

      // 2. Fetch all referenced measurements
      const allMeasIds = new Set<string>();
      (allMeasLinks || []).forEach((l: any) => allMeasIds.add(l.measurement_id));
      const measData: Record<string, { units: number; unit: string }> = {};
      if (allMeasIds.size > 0) {
        const { data: measurements, error: measErr } = await supabase
          .from('budget_measurements')
          .select('id, manual_units, count_raw, measurement_unit')
          .in('id', Array.from(allMeasIds));
        if (measErr) { console.error('fetchItemSummaries measurements error:', measErr); return; }
        (measurements || []).forEach((m: any) => {
          measData[m.id] = {
            units: m.manual_units != null ? Number(m.manual_units) : Number(m.count_raw) || 0,
            unit: m.measurement_unit || 'ud',
          };
        });
      }

      // 3. Build parent map for ancestor traversal
      const parentMap: Record<string, string | null> = {};
      currentItems.forEach(i => { parentMap[i.id] = i.parent_id; });

      // 4. Calculate inherited measurement units per item (walk up ancestors)
      const getInheritedMeas = (itemId: string): { total: number; unit: string } => {
        let currentId: string | null = itemId;
        while (currentId) {
          const mids = measLinksByItem[currentId];
          if (mids && mids.length > 0) {
            let total = 0;
            let unit = 'ud';
            mids.forEach(mid => {
              const m = measData[mid];
              if (m) { total += m.units; unit = m.unit; }
            });
            return { total, unit };
          }
          currentId = parentMap[currentId] ?? null;
        }
        return { total: 0, unit: 'ud' };
      };

      // 5. Fetch all tolosa_item_resources links
      const { data: allResLinks, error: resLinksErr } = await supabase
        .from('tolosa_item_resources')
        .select('tolosa_item_id, resource_id')
        .in('tolosa_item_id', itemIds);
      if (resLinksErr) { console.error('fetchItemSummaries resLinks error:', resLinksErr); return; }

      const resLinksByItem: Record<string, string[]> = {};
      (allResLinks || []).forEach((l: any) => {
        if (!resLinksByItem[l.tolosa_item_id]) resLinksByItem[l.tolosa_item_id] = [];
        resLinksByItem[l.tolosa_item_id].push(l.resource_id);
      });

      // 6. Fetch all referenced resources
      const allResIds = new Set<string>();
      (allResLinks || []).forEach((l: any) => allResIds.add(l.resource_id));
      const resData: Record<string, any> = {};
      if (allResIds.size > 0) {
        const { data: resources, error: resErr } = await supabase
          .from('budget_activity_resources')
          .select('id, external_unit_cost, safety_margin_percent, sales_margin_percent, manual_units, related_units, is_estimation')
          .in('id', Array.from(allResIds));
        if (resErr) { console.error('fetchItemSummaries resources error:', resErr); return; }
        (resources || []).forEach((r: any) => { resData[r.id] = r; });
      }

      // 7. Calculate subtotals per item (split normal vs est)
      const summaries: Record<string, { measurementUnits: number; measurementUnit: string; resourceSubtotal: number; normalSubtotal: number; estSubtotal: number }> = {};
      itemIds.forEach(itemId => {
        const meas = getInheritedMeas(itemId);
        const rids = resLinksByItem[itemId] || [];
        let subtotal = 0;
        let normalSub = 0;
        let estSub = 0;
        rids.forEach(rid => {
          const r = resData[rid];
          if (r) {
            const s = calcResourceSubtotal({
              externalUnitCost: r.external_unit_cost,
              safetyPercent: r.safety_margin_percent,
              salesPercent: r.sales_margin_percent,
              manualUnits: r.manual_units,
              relatedUnits: r.manual_units != null ? r.related_units : meas.total,
            });
            subtotal += s;
            if (r.is_estimation) { estSub += s; } else { normalSub += s; }
          }
        });
        summaries[itemId] = { measurementUnits: meas.total, measurementUnit: meas.unit, resourceSubtotal: subtotal, normalSubtotal: normalSub, estSubtotal: estSub };
      });

      // Only update state if values actually changed (prevent re-render cascade)
      setItemSummaries(prev => {
        const changed = itemIds.some(id => {
          const p = prev[id];
          const n = summaries[id];
          if (!p && !n) return false;
          if (!p || !n) return true;
          return p.measurementUnits !== n.measurementUnits || p.measurementUnit !== n.measurementUnit || p.resourceSubtotal !== n.resourceSubtotal || p.normalSubtotal !== n.normalSubtotal || p.estSubtotal !== n.estSubtotal;
        });
        return changed ? summaries : prev;
      });

      const newSubtotals: Record<string, number> = {};
      const newNormal: Record<string, number> = {};
      const newEst: Record<string, number> = {};
      itemIds.forEach(id => {
        newSubtotals[id] = summaries[id]?.resourceSubtotal || 0;
        newNormal[id] = summaries[id]?.normalSubtotal || 0;
        newEst[id] = summaries[id]?.estSubtotal || 0;
      });
      setItemSubtotals(prev => {
        const changed = itemIds.some(id => (prev[id] || 0) !== (newSubtotals[id] || 0));
        return changed ? newSubtotals : prev;
      });
      setItemSubtotalsNormal(prev => {
        const changed = itemIds.some(id => (prev[id] || 0) !== (newNormal[id] || 0));
        return changed ? newNormal : prev;
      });
      setItemSubtotalsEst(prev => {
        const changed = itemIds.some(id => (prev[id] || 0) !== (newEst[id] || 0));
        return changed ? newEst : prev;
      });
    } catch (err) {
      console.error('fetchItemSummaries unexpected error:', err);
    }
  }, []);

  const initDondeForm = (item: TolosItem) => {
    if (!dondeForm[item.id]) {
      setDondeForm(prev => ({
        ...prev,
        [item.id]: {
          address_street: item.address_street || '',
          address_city: item.address_city || '',
          address_postal_code: item.address_postal_code || '',
          address_province: item.address_province || '',
          latitude: item.latitude != null ? String(item.latitude) : '',
          longitude: item.longitude != null ? String(item.longitude) : '',
          google_maps_url: item.google_maps_url || '',
          cadastral_reference: item.cadastral_reference || '',
        },
      }));
    }
  };

  const updateDondeField = (itemId: string, field: string, value: string) => {
    setDondeForm(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  const saveDondeForm = async (itemId: string) => {
    const f = dondeForm[itemId];
    if (!f) return;
    const fields: Record<string, unknown> = {
      address_street: f.address_street || null,
      address_city: f.address_city || null,
      address_postal_code: f.address_postal_code || null,
      address_province: f.address_province || null,
      latitude: f.latitude ? parseFloat(f.latitude) || null : null,
      longitude: f.longitude ? parseFloat(f.longitude) || null : null,
      google_maps_url: f.google_maps_url || null,
      cadastral_reference: f.cadastral_reference || null,
    };
    const { error } = await supabase.from('tolosa_items').update(fields).eq('id', itemId);
    if (error) {
      toast.error('Error al guardar ubicación');
    } else {
      toast.success('Ubicación guardada');
      fetchItems();
    }
  };

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
      const loadedItems = (data as TolosItem[]) || [];
      setItems(loadedItems);
      itemsRef.current = loadedItems;
      setDondeForm({});

      // Fetch linked contact names
      const contactIds = new Set<string>();
      loadedItems.forEach(i => {
        if (i.client_contact_id) contactIds.add(i.client_contact_id);
        if (i.supplier_contact_id) contactIds.add(i.supplier_contact_id);
      });
      if (contactIds.size > 0) {
        const { data: cData } = await supabase
          .from('crm_contacts')
          .select('id, name, surname')
          .in('id', Array.from(contactIds));
        if (cData) {
          const cache: Record<string, string> = {};
          cData.forEach((c: any) => {
            cache[c.id] = `${c.name}${c.surname ? ' ' + c.surname : ''}`;
          });
          setContactCache(prev => ({ ...prev, ...cache }));
        }
      }

      // Fetch linked housing profiles
      const profileIds = new Set<string>();
      loadedItems.forEach(i => {
        if (i.housing_profile_id) profileIds.add(i.housing_profile_id);
      });
      if (profileIds.size > 0) {
        const { data: pData } = await supabase
          .from('project_profiles')
          .select('id, contact_name, contact_email, poblacion, num_plantas, m2_por_planta, num_habitaciones_total, num_banos_total, tipo_salon, tipo_cocina, lavanderia, despensa, garaje, porche_cubierto, patio_descubierto, presupuesto_global, espacios_detalle, altura_habitaciones')
          .in('id', Array.from(profileIds));
        if (pData) {
          const cache: Record<string, FullProfileData> = {};
          pData.forEach((p: any) => { cache[p.id] = p; });
          setProfileCache(prev => ({ ...prev, ...cache }));
        }
      }
    }
    setLoading(false);
    // Directly fetch summaries after items are loaded (ref is already updated)
    fetchItemSummaries();
  }, [budgetId, fetchItemSummaries]);

  const fetchContacts = useCallback(async (search?: string) => {
    let query = supabase.from('crm_contacts').select('id, name, surname, email, phone').order('name').limit(20);
    if (search) query = query.or(`name.ilike.%${search}%,surname.ilike.%${search}%`);
    const { data } = await query;
    setContacts((data as ContactInfo[]) || []);
  }, []);

  const fetchHousingProfiles = useCallback(async (search?: string) => {
    let query = supabase
      .from('project_profiles')
      .select('id, contact_name, contact_email, poblacion, created_at, project_id')
      .order('created_at', { ascending: false })
      .limit(20);
    if (search) query = query.or(`contact_name.ilike.%${search}%,contact_email.ilike.%${search}%,poblacion.ilike.%${search}%`);
    const { data } = await query;
    setHousingProfiles((data as ProfileInfo[]) || []);
  }, []);

  useEffect(() => { fetchItems(); fetchContacts(); fetchHousingProfiles(); fetchPhases(); }, [fetchItems, fetchContacts, fetchHousingProfiles, fetchPhases]);

  // Build set of non-executed codes for cascading filter
  const inactiveCodes = useMemo(() => {
    const codes = new Set<string>();
    items.filter(i => i.is_executed === false).forEach(i => codes.add(i.code));
    return codes;
  }, [items]);

  const isItemVisible = useCallback((item: TolosItem): boolean => {
    if (!showOnlyExecuted) {
      // still apply search
    } else {
      if (item.is_executed === false) return false;
      // Check if any ancestor code is inactive (cascading)
      const codeParts = item.code.split('.');
      for (let i = codeParts.length - 1; i >= 1; i--) {
        const parentCode = codeParts.slice(0, i).join('.');
        if (inactiveCodes.has(parentCode)) return false;
      }
    }
    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const fields = [item.code, item.name, item.description, item.address_street, item.address_city, item.address_postal_code, item.address_province, item.cadastral_reference];
      const matchesSelf = fields.some(f => f && f.toLowerCase().includes(q));
      // Also show if any descendant matches (so tree isn't broken)
      if (!matchesSelf) {
        const hasMatchingDescendant = (parentId: string): boolean => {
          const children = items.filter(i => i.parent_id === parentId);
          return children.some(c => {
            const cf = [c.code, c.name, c.description, c.address_street, c.address_city, c.address_postal_code, c.address_province, c.cadastral_reference];
            return cf.some(f => f && f.toLowerCase().includes(q)) || hasMatchingDescendant(c.id);
          });
        };
        // Also show if any ancestor matches (so context is preserved)
        const hasMatchingAncestor = (parentId: string | null): boolean => {
          if (!parentId) return false;
          const parent = items.find(i => i.id === parentId);
          if (!parent) return false;
          const pf = [parent.code, parent.name, parent.description, parent.address_street, parent.address_city];
          if (pf.some(f => f && f.toLowerCase().includes(q))) return true;
          return hasMatchingAncestor(parent.parent_id);
        };
        if (!hasMatchingDescendant(item.id) && !hasMatchingAncestor(item.parent_id)) return false;
      }
    }
    return true;
  }, [showOnlyExecuted, inactiveCodes, searchTerm, items]);

  const rootItems = items.filter(i => !i.parent_id && isItemVisible(i));
  const getChildren = (parentId: string) => items.filter(i => i.parent_id === parentId && isItemVisible(i));

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

  // Collect all descendants recursively
  const getAllDescendants = useCallback((parentId: string): TolosItem[] => {
    const children = items.filter(i => i.parent_id === parentId);
    const all: TolosItem[] = [...children];
    children.forEach(c => { all.push(...getAllDescendants(c.id)); });
    return all;
  }, [items]);

  const handleDelete = async (item: TolosItem) => {
    const descendants = getAllDescendants(item.id);
    if (descendants.length > 0) {
      // Show confirmation dialog
      setDeleteConfirm({ item, descendants });
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

  const handleDeleteWithDescendants = async () => {
    if (!deleteConfirm) return;
    const { item, descendants } = deleteConfirm;
    // Delete deepest first (reverse by code length)
    const sorted = [...descendants].sort((a, b) => b.code.length - a.code.length);
    for (const d of sorted) {
      await supabase.from('tolosa_items').delete().eq('id', d.id);
    }
    const { error } = await supabase.from('tolosa_items').delete().eq('id', item.id);
    if (error) {
      toast.error('Error al eliminar');
    } else {
      toast.success(`Eliminado "${item.name}" y ${descendants.length} descendientes`);
      fetchItems();
    }
    setDeleteConfirm(null);
  };

  const handleDeleteById = async (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (item) handleDelete(item);
  };

  const handleUpdateItemFromGraph = async (itemId: string, fields: { name?: string; code?: string }) => {
    const updateFields: Record<string, unknown> = {};
    if (fields.name) updateFields.name = fields.name;
    if (fields.code) updateFields.code = fields.code;
    const { error } = await supabase.from('tolosa_items').update(updateFields).eq('id', itemId);
    if (error) {
      toast.error('Error al actualizar');
    } else {
      fetchItems();
    }
  };

  const handleAddFromGraph = async (parentId: string | null, name?: string) => {
    const itemName = name || graphAddName.trim();
    if (!itemName) return;
    const code = getNextCode(parentId);
    const siblings = parentId ? getChildren(parentId) : rootItems;
    const { error } = await supabase
      .from('tolosa_items')
      .insert({
        budget_id: budgetId,
        parent_id: parentId,
        code,
        name: itemName,
        order_index: siblings.length,
      });
    if (error) {
      toast.error('Error al añadir');
    } else {
      toast.success('QUÉ? añadido');
      setGraphAddName('');
      if (parentId) setExpandedIds(prev => new Set(prev).add(parentId));
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

  const updateItemField = async (id: string, fields: Record<string, unknown>) => {
    const { error } = await supabase.from('tolosa_items').update(fields).eq('id', id);
    if (error) {
      toast.error('Error al guardar');
    } else {
      fetchItems();
    }
  };

  const isEstimacionItem = (item: TolosItem) => {
    return item.code?.includes('.E') || item.name?.includes('(Est.)');
  };

  const openDuplicateDialog = (item: TolosItem, asSub: boolean) => {
    setDupItem(item);
    setDupAsSub(asSub);
    setDupType('normal');
    setDupName(item.name + ' (copia)');
    setDupUnits('1');
    setDupUnitPrice('');
    setDupVatPercent('21');
    setDupDialogOpen(true);
  };

  const executeDuplicate = async () => {
    if (!dupItem) return;
    const item = dupItem;
    const asSub = dupAsSub;
    const isEstimacion = dupType === 'estimacion';
    const trimmedName = dupName.trim();
    if (!trimmedName) { toast.error('El nombre es obligatorio'); return; }

    const targetParentId = asSub ? item.id : item.parent_id;
    const code = getNextCode(targetParentId);
    const siblings = targetParentId ? getChildren(targetParentId) : rootItems;

    const { data: newItem, error } = await supabase
      .from('tolosa_items')
      .insert({
        budget_id: budgetId,
        parent_id: targetParentId,
        code: isEstimacion ? code + '.E' : code,
        name: trimmedName,
        description: item.description,
        order_index: siblings.length,
        address_street: item.address_street,
        address_city: item.address_city,
        address_postal_code: item.address_postal_code,
        address_province: item.address_province,
        latitude: item.latitude,
        longitude: item.longitude,
        cadastral_reference: item.cadastral_reference,
        google_maps_url: item.google_maps_url,
        client_contact_id: item.client_contact_id,
        supplier_contact_id: item.supplier_contact_id,
        housing_profile_id: item.housing_profile_id,
        phase_id: item.phase_id,
      })
      .select()
      .single();

    if (error || !newItem) {
      toast.error('Error al duplicar');
      return;
    }

    if (isEstimacion) {
      // Create a linked budget_activity with estimation type + resource
      const units = parseFloat(dupUnits) || 1;
      const unitPrice = parseFloat(dupUnitPrice) || 0;
      const vatPercent = parseFloat(dupVatPercent) || 21;

      const { data: newActivity } = await supabase
        .from('budget_activities')
        .insert({
          budget_id: budgetId,
          code: `Est.${code}`,
          name: trimmedName,
          activity_type: 'estimacion',
          is_executed: true,
        })
        .select()
        .single();

      if (newActivity) {
        await supabase.from('budget_activity_resources').insert({
          budget_id: budgetId,
          activity_id: newActivity.id,
          name: trimmedName,
          manual_units: units,
          external_unit_cost: unitPrice,
          purchase_vat_percent: vatPercent,
          resource_type: 'material',
        });
        // Link resource to tolosa item
        await supabase.from('tolosa_item_resources').insert({
          tolosa_item_id: (newItem as any).id,
          resource_id: newActivity.id,
        });
      }
    } else {
      const children = getChildren(item.id);
      if (children.length > 0) {
        await duplicateChildren(children, (newItem as any).id, (newItem as any).code);
      }
    }

    toast.success(isEstimacion ? 'Estimación creada' : (asSub ? 'Duplicado como sub-QUÉ?' : 'QUÉ? duplicado'));
    if (targetParentId) setExpandedIds(prev => new Set(prev).add(targetParentId));
    setDupDialogOpen(false);
    setDupItem(null);
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
           address_street: child.address_street,
           address_city: child.address_city,
           address_postal_code: child.address_postal_code,
          address_province: child.address_province,
          latitude: child.latitude,
          longitude: child.longitude,
          cadastral_reference: child.cadastral_reference,
          google_maps_url: child.google_maps_url,
          client_contact_id: child.client_contact_id,
          supplier_contact_id: child.supplier_contact_id,
          housing_profile_id: child.housing_profile_id,
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
      const isClosing = next.has(id);
      isClosing ? next.delete(id) : next.add(id);
      // Track last worked item
      if (!isClosing) setLastWorkedItemId(id);
      // If closing an item opened from graph ✏️ button, return to graph view
      if (isClosing && graphEntryItemId === id) {
        setGraphEntryItemId(null);
        setLastWorkedItemId(id); // remember for centering
        setTimeout(() => setViewMode('cards'), 0);
      }
      return next;
    });
  };

  const setDimension = (itemId: string, dim: string) => {
    setActiveDimension(prev => ({
      ...prev,
      [itemId]: prev[itemId] === dim ? '' : dim,
    }));
  };

  // Recalculate codes for an item and all its descendants recursively
  const recalculateCodesForChildren = async (parentId: string | null, parentCode: string) => {
    const children = parentId ? items.filter(i => i.parent_id === parentId) : items.filter(i => !i.parent_id);
    const sorted = [...children].sort((a, b) => a.order_index - b.order_index);
    const updates: PromiseLike<any>[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const newCode = parentCode + String(i + 1).padStart(3, '0');
      if (sorted[i].code !== newCode) {
        updates.push(
          supabase.from('tolosa_items').update({ code: newCode, order_index: i }).eq('id', sorted[i].id).then()
        );
      } else if (sorted[i].order_index !== i) {
        updates.push(
          supabase.from('tolosa_items').update({ order_index: i }).eq('id', sorted[i].id).then()
        );
      }
    }
    await Promise.all(updates);
  };

  const recalculateAllCodes = async () => {
    // Fetch fresh items
    const { data } = await supabase.from('tolosa_items').select('*').eq('budget_id', budgetId).order('order_index');
    if (!data) return;
    const allItems = data as TolosItem[];

    const rebuildRecursive = async (parentId: string | null, prefix: string) => {
      const children = allItems.filter(i => parentId ? i.parent_id === parentId : !i.parent_id);
      const sorted = [...children].sort((a, b) => a.order_index - b.order_index);
      for (let i = 0; i < sorted.length; i++) {
        const newCode = prefix + String(i + 1).padStart(3, '0');
        if (sorted[i].code !== newCode || sorted[i].order_index !== i) {
          await supabase.from('tolosa_items').update({ code: newCode, order_index: i }).eq('id', sorted[i].id);
        }
        // Update in-memory for nested lookups
        sorted[i].code = newCode;
        sorted[i].order_index = i;
        await rebuildRecursive(sorted[i].id, newCode);
      }
    };
    await rebuildRecursive(null, '');
    fetchItems();
  };

  // Move item up/down within its siblings
  const moveItem = async (item: TolosItem, direction: 'up' | 'down') => {
    const siblings = item.parent_id ? getChildren(item.parent_id) : rootItems;
    const sorted = [...siblings].sort((a, b) => a.order_index - b.order_index);
    const idx = sorted.findIndex(s => s.id === item.id);
    if (direction === 'up' && idx <= 0) return;
    if (direction === 'down' && idx >= sorted.length - 1) return;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const other = sorted[swapIdx];

    await Promise.all([
      supabase.from('tolosa_items').update({ order_index: swapIdx }).eq('id', item.id).then(),
      supabase.from('tolosa_items').update({ order_index: idx }).eq('id', other.id).then(),
    ]);
    await recalculateAllCodes();
  };

  // Indent (→): become child of the sibling above
  const indentItem = async (item: TolosItem) => {
    const siblings = item.parent_id ? getChildren(item.parent_id) : rootItems;
    const sorted = [...siblings].sort((a, b) => a.order_index - b.order_index);
    const idx = sorted.findIndex(s => s.id === item.id);
    if (idx <= 0) {
      toast.error('No hay un hermano superior para anidar');
      return;
    }
    const newParent = sorted[idx - 1];
    const newSiblings = getChildren(newParent.id);

    await supabase.from('tolosa_items').update({
      parent_id: newParent.id,
      order_index: newSiblings.length,
    }).eq('id', item.id);

    setExpandedIds(prev => new Set(prev).add(newParent.id));
    await recalculateAllCodes();
    toast.success(`"${item.name}" movido dentro de "${newParent.name}"`);
  };

  // Outdent (←): move to parent's level (become sibling of parent)
  const outdentItem = async (item: TolosItem) => {
    if (!item.parent_id) {
      toast.error('Ya está en el nivel raíz');
      return;
    }
    const parent = items.find(i => i.id === item.parent_id);
    if (!parent) return;

    // Place after the parent in the parent's siblings
    const grandParentId = parent.parent_id;
    const parentSiblings = grandParentId ? getChildren(grandParentId) : rootItems;
    const parentIdx = parentSiblings.findIndex(s => s.id === parent.id);

    // Shift siblings after parentIdx to make room
    const sorted = [...parentSiblings].sort((a, b) => a.order_index - b.order_index);
    const updates: PromiseLike<any>[] = [];
    for (const s of sorted) {
      if (s.order_index > parentIdx) {
        updates.push(
          supabase.from('tolosa_items').update({ order_index: s.order_index + 1 }).eq('id', s.id).then()
        );
      }
    }
    await Promise.all(updates);

    await supabase.from('tolosa_items').update({
      parent_id: grandParentId || null,
      order_index: parentIdx + 1,
    }).eq('id', item.id);

    await recalculateAllCodes();
    toast.success(`"${item.name}" movido al nivel de "${parent.name}"`);
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

  const getGoogleMapsUrl = (item: TolosItem) => {
    // Priority: manual URL > coordinates > address-based
    if (item.google_maps_url) return item.google_maps_url;
    if (item.latitude && item.longitude) {
      return `https://www.google.com/maps?q=${item.latitude},${item.longitude}`;
    }
    const addr = [item.address_street, item.address_city, item.address_postal_code, item.address_province].filter(Boolean).join(', ');
    if (addr) return `https://www.google.com/maps/search/${encodeURIComponent(addr)}`;
    return null;
  };

  const getCatastroUrl = (ref: string) => {
    return `https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCConCiworking.aspx?RefC=${encodeURIComponent(ref)}`;
  };

  const getCatastroDescriptivaUrl = (ref: string) => {
    return `https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCBusqueda.aspx?pest=rc&RCCompleta=${encodeURIComponent(ref)}&final=&DenijaBusworking=S`;
  };

  const getCatastroMapaUrl = (ref: string) => {
    return `https://www1.sedecatastro.gob.es/Cartografia/mapa.aspx?refcat=${encodeURIComponent(ref)}`;
  };

  const getContactName = (contactId: string | null) => {
    if (!contactId) return null;
    if (contactCache[contactId]) return contactCache[contactId];
    const c = contacts.find(c => c.id === contactId);
    return c ? `${c.name}${c.surname ? ' ' + c.surname : ''}` : contactId.slice(0, 8) + '...';
  };

  // DÓNDE? panel
  const renderDondePanel = (item: TolosItem) => {
    initDondeForm(item);
    const f = dondeForm[item.id];
    if (!f) return null;

    const mapsUrl = f.google_maps_url || (() => {
      if (f.latitude && f.longitude) return `https://www.google.com/maps?q=${f.latitude},${f.longitude}`;
      const addr = [f.address_street, f.address_city, f.address_postal_code, f.address_province].filter(Boolean).join(', ');
      if (addr) return `https://www.google.com/maps/search/${encodeURIComponent(addr)}`;
      return null;
    })();

    const isLocationOpen = dondeLocationOpen[item.id] ?? false;

    return (
      <div className="space-y-3 p-3 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <MapPin className="h-4 w-4" /> DÓNDE? — Ubicación y Áreas de Trabajo
          </h4>
          <Button size="sm" variant="ghost" className="text-xs h-7 gap-1 text-muted-foreground" onClick={() => setDimension(item.id, '')}>
            <X className="h-3 w-3" /> Cerrar
          </Button>
        </div>

        {/* 1. Ubicación del terreno - Collapsible */}
        <Collapsible open={isLocationOpen} onOpenChange={(open) => setDondeLocationOpen(prev => ({ ...prev, [item.id]: open }))}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 w-full text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors py-1">
              {isLocationOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Ubicación del terreno
              {(f.address_street || f.address_city || f.cadastral_reference) && (
                <Badge variant="outline" className="text-[10px] ml-1">con datos</Badge>
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-2">
            {/* 1. Dirección completa */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">1. Dirección completa</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground">Calle / Dirección</label>
                  <input
                    type="text"
                    value={f.address_street}
                    placeholder="Calle, número..."
                    onChange={e => updateDondeField(item.id, 'address_street', e.target.value)}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Población</label>
                  <input
                    type="text"
                    value={f.address_city}
                    placeholder="Madrid, Barcelona..."
                    onChange={e => updateDondeField(item.id, 'address_city', e.target.value)}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Código Postal</label>
                    <input
                      type="text"
                      value={f.address_postal_code}
                      placeholder="28001"
                      onChange={e => updateDondeField(item.id, 'address_postal_code', e.target.value)}
                      className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Provincia</label>
                    <input
                      type="text"
                      value={f.address_province}
                      placeholder="Madrid"
                      onChange={e => updateDondeField(item.id, 'address_province', e.target.value)}
                      className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Coordenadas Google Maps */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">2. Coordenadas Google Maps</p>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-muted-foreground">URL de Google Maps (pega aquí la dirección)</label>
                  <input
                    type="text"
                    value={f.google_maps_url}
                    placeholder="https://www.google.com/maps/place/..."
                    onChange={e => updateDondeField(item.id, 'google_maps_url', e.target.value)}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={f.latitude}
                    placeholder="Latitud"
                    onChange={e => updateDondeField(item.id, 'latitude', e.target.value)}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={f.longitude}
                    placeholder="Longitud"
                    onChange={e => updateDondeField(item.id, 'longitude', e.target.value)}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
              </div>
              {mapsUrl && (
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => window.open(mapsUrl, '_blank', 'noopener,noreferrer')}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" /> Ir a dirección
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(mapsUrl);
                      toast.success('URL copiada al portapapeles');
                    }}
                  >
                    <Copy className="h-3 w-3 mr-1" /> Copiar dirección
                  </Button>
                </div>
              )}
            </div>

            {/* 3. Referencia Catastral */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">3. Referencia Catastral</p>
              <input
                type="text"
                value={f.cadastral_reference}
                placeholder="0000000AA0000A0001AA"
                onChange={e => updateDondeField(item.id, 'cadastral_reference', e.target.value)}
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              {f.cadastral_reference && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={getCatastroUrl(f.cadastral_reference)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Building className="h-3 w-3" /> Ficha catastral
                    </a>
                    <a
                      href={getCatastroMapaUrl(f.cadastral_reference)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <MapPin className="h-3 w-3" /> Mapa catastral
                    </a>
                  </div>
                  <div className="rounded-lg border overflow-hidden bg-background">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b">
                      <span className="text-xs font-semibold text-muted-foreground">Consulta descriptiva y gráfica</span>
                      <a
                        href={getCatastroDescriptivaUrl(f.cadastral_reference)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" /> Abrir en nueva pestaña
                      </a>
                    </div>
                    <iframe
                      src={getCatastroDescriptivaUrl(f.cadastral_reference)}
                      className="w-full border-0"
                      style={{ height: '500px' }}
                      title="Consulta descriptiva y gráfica - Catastro"
                      sandbox="allow-scripts allow-same-origin allow-popups"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Botón Guardar */}
            <div className="flex justify-end pt-2 border-t border-amber-200 dark:border-amber-800">
              <Button size="sm" onClick={() => saveDondeForm(item.id)}>
                <Check className="h-3 w-3 mr-1" /> Guardar ubicación
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* 2. Áreas de Trabajo */}
        <div className="space-y-2 pt-2 border-t border-amber-200 dark:border-amber-800">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Áreas de Trabajo</p>
          <BudgetWorkAreasTab budgetId={budgetId} isAdmin={isAdmin} />
        </div>
      </div>
    );
  };

  // QUIÉN? panel
  const renderQuienPanel = (item: TolosItem) => (
    <div className="space-y-3 p-3 rounded-lg border border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
          <Users className="h-4 w-4" /> QUIÉN? — Personas
        </h4>
        <Button size="sm" variant="ghost" className="text-xs h-7 gap-1 text-muted-foreground" onClick={() => setDimension(item.id, '')}>
          <X className="h-3 w-3" /> Cerrar
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Client */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground flex items-center gap-1">
            <User className="h-3 w-3" /> Cliente
          </label>
          {item.client_contact_id ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">{getContactName(item.client_contact_id)}</Badge>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateItemField(item.id, { client_contact_id: null })}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              <Input
                placeholder="Buscar contacto..."
                className="h-8 text-sm"
                value={contactSearch}
                onChange={e => { setContactSearch(e.target.value); fetchContacts(e.target.value); }}
              />
              {contactSearch && contacts.length > 0 && (
                <div className="max-h-32 overflow-y-auto border rounded bg-background">
                  {contacts.map(c => (
                    <button
                      key={c.id}
                      className="w-full text-left px-2 py-1 text-sm hover:bg-accent truncate"
                      onClick={() => { updateItemField(item.id, { client_contact_id: c.id }); setContactSearch(''); }}
                    >
                      {c.name} {c.surname || ''} {c.email ? `· ${c.email}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Supplier */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground flex items-center gap-1">
            <Truck className="h-3 w-3" /> Proveedor principal
          </label>
          {item.supplier_contact_id ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">{getContactName(item.supplier_contact_id)}</Badge>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateItemField(item.id, { supplier_contact_id: null })}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              <Input
                placeholder="Buscar proveedor..."
                className="h-8 text-sm"
                value={contactSearch}
                onChange={e => { setContactSearch(e.target.value); fetchContacts(e.target.value); }}
              />
              {contactSearch && contacts.length > 0 && (
                <div className="max-h-32 overflow-y-auto border rounded bg-background">
                  {contacts.map(c => (
                    <button
                      key={c.id}
                      className="w-full text-left px-2 py-1 text-sm hover:bg-accent truncate"
                      onClick={() => { updateItemField(item.id, { supplier_contact_id: c.id }); setContactSearch(''); }}
                    >
                      {c.name} {c.surname || ''} {c.phone ? `· ${c.phone}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // CÓMO? panel
  const getProfileName = (profileId: string | null) => {
    if (!profileId) return null;
    const p = profileCache[profileId];
    if (p) return `${p.contact_name} — ${p.poblacion || p.contact_email}`;
    const pList = housingProfiles.find(p => p.id === profileId);
    return pList ? `${pList.contact_name} — ${pList.poblacion || pList.contact_email}` : profileId.slice(0, 8) + '...';
  };

  const renderProfileDetail = (profile: FullProfileData) => {
    const spaces: SpaceDetail[] = Array.isArray(profile.espacios_detalle)
      ? (profile.espacios_detalle as unknown as SpaceDetail[])
      : [];
    const totalM2 = spaces.reduce((sum, s) => sum + (s.m2 || 0), 0);
    const m2Planta = profile.m2_por_planta ? parseFloat(profile.m2_por_planta) : null;
    const numPlantas = profile.num_plantas ? parseInt(profile.num_plantas) : null;
    const m2Construidos = m2Planta && numPlantas ? m2Planta * numPlantas : null;

    return (
      <div className="space-y-2 mt-2">
        {/* Summary metrics */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 rounded border bg-background text-center">
            <p className="text-lg font-bold text-foreground">{m2Construidos ? `${m2Construidos}` : '—'}</p>
            <p className="text-[10px] text-muted-foreground uppercase">m² Construidos</p>
          </div>
          <div className="p-2 rounded border bg-background text-center">
            <p className="text-lg font-bold text-foreground">{totalM2 > 0 ? `${totalM2.toFixed(1)}` : '—'}</p>
            <p className="text-[10px] text-muted-foreground uppercase">m² Habitables</p>
          </div>
          <div className="p-2 rounded border bg-background text-center">
            <p className="text-lg font-bold text-foreground">{m2Planta ? `${m2Planta}` : '—'}</p>
            <p className="text-[10px] text-muted-foreground uppercase">m²/Planta</p>
          </div>
        </div>

        {/* Key data row */}
        <div className="flex flex-wrap gap-2 text-xs">
          {profile.num_plantas && (
            <Badge variant="outline" className="gap-1"><Layers className="h-3 w-3" />{profile.num_plantas} plantas</Badge>
          )}
          {profile.num_habitaciones_total && (
            <Badge variant="outline" className="gap-1"><Home className="h-3 w-3" />{profile.num_habitaciones_total} hab.</Badge>
          )}
          {profile.num_banos_total && (
            <Badge variant="outline" className="gap-1">{profile.num_banos_total} baños</Badge>
          )}
          {profile.altura_habitaciones && (
            <Badge variant="outline" className="gap-1"><Ruler className="h-3 w-3" />{profile.altura_habitaciones}m alto</Badge>
          )}
          {profile.presupuesto_global && (
            <Badge variant="outline" className="gap-1"><DollarSign className="h-3 w-3" />{profile.presupuesto_global}€</Badge>
          )}
        </div>

        {/* Spaces list */}
        {spaces.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Espacios del perfil</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {spaces.map(s => (
                <div key={s.id} className="flex items-center justify-between px-2 py-1 rounded border bg-background text-sm">
                  <span className="truncate">{s.name}</span>
                  <span className="text-muted-foreground text-xs shrink-0 ml-2">
                    {s.m2 ? `${s.m2} m²` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Extra features */}
        {(profile.tipo_salon || profile.tipo_cocina || profile.garaje || profile.porche_cubierto || profile.lavanderia || profile.despensa) && (
          <div className="flex flex-wrap gap-1 text-xs">
            {profile.tipo_salon && <Badge variant="secondary" className="text-[10px]">Salón: {profile.tipo_salon}</Badge>}
            {profile.tipo_cocina && <Badge variant="secondary" className="text-[10px]">Cocina: {profile.tipo_cocina}</Badge>}
            {profile.garaje && profile.garaje !== 'no' && <Badge variant="secondary" className="text-[10px]">Garaje: {profile.garaje}</Badge>}
            {profile.porche_cubierto && profile.porche_cubierto !== 'no' && <Badge variant="secondary" className="text-[10px]">Porche: {profile.porche_cubierto}</Badge>}
            {profile.patio_descubierto && profile.patio_descubierto !== 'no' && <Badge variant="secondary" className="text-[10px]">Patio: {profile.patio_descubierto}</Badge>}
            {profile.lavanderia && profile.lavanderia !== 'no' && <Badge variant="secondary" className="text-[10px]">Lavandería: {profile.lavanderia}</Badge>}
            {profile.despensa && profile.despensa !== 'no' && <Badge variant="secondary" className="text-[10px]">Despensa: {profile.despensa}</Badge>}
          </div>
        )}
      </div>
    );
  };

  const [comoSubmenu, setComoSubmenu] = useState<Record<string, string>>({});

  const setComoSub = (itemId: string, sub: string) => {
    setComoSubmenu(prev => ({ ...prev, [itemId]: sub }));
  };

  const renderComoPerfilSection = (item: TolosItem) => {
    const isPickerOpen = showProfilePicker === item.id;

    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Perfil de vivienda</p>

        {item.housing_profile_id ? (
          <div className="space-y-0">
            <div className="flex items-center gap-2 p-2 rounded-t border border-blue-300 bg-blue-100/50 dark:border-blue-700 dark:bg-blue-900/30">
              <Link className="h-4 w-4 text-blue-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{getProfileName(item.housing_profile_id)}</p>
                <p className="text-xs text-muted-foreground">Perfil vinculado</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-xs shrink-0"
                onClick={() => updateItemField(item.id, { housing_profile_id: null })}
              >
                <Unlink className="h-3 w-3 mr-1" /> Desvincular
              </Button>
            </div>
            {profileCache[item.housing_profile_id] && (
              <div className="p-2 rounded-b border border-t-0 border-blue-300 dark:border-blue-700">
                {renderProfileDetail(profileCache[item.housing_profile_id])}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-2 rounded border border-dashed border-blue-300 dark:border-blue-700">
              <FileText className="h-4 w-4 text-blue-500" />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Sin perfil vinculado</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => {
                  setShowProfilePicker(isPickerOpen ? null : item.id);
                  if (!isPickerOpen) fetchHousingProfiles();
                }}
              >
                <Link className="h-3 w-3 mr-1" /> Vincular perfil
              </Button>
            </div>

            {isPickerOpen && (
              <div className="space-y-2 p-2 rounded border border-blue-200 bg-background dark:border-blue-800">
                <input
                  type="text"
                  value={profileSearch}
                  placeholder="Buscar perfil por nombre, email o población..."
                  onChange={e => {
                    setProfileSearch(e.target.value);
                    fetchHousingProfiles(e.target.value);
                  }}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                {housingProfiles.length > 0 ? (
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {housingProfiles.map(p => (
                      <button
                        key={p.id}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded flex items-center justify-between gap-2"
                        onClick={() => {
                          updateItemField(item.id, { housing_profile_id: p.id });
                          setShowProfilePicker(null);
                          setProfileSearch('');
                        }}
                      >
                        <div className="min-w-0">
                          <span className="font-medium">{p.contact_name}</span>
                          {p.poblacion && <span className="text-muted-foreground"> — {p.poblacion}</span>}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{p.contact_email}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">No se encontraron perfiles</p>
                )}
                <div className="pt-1 border-t">
                  <p className="text-xs text-muted-foreground">
                    ¿No existe el perfil?{' '}
                    <button
                      className="text-primary hover:underline font-medium"
                      onClick={() => {
                        toast.info('Para crear un nuevo perfil, ve a la pestaña "Perfil" del presupuesto o recíbelo desde el formulario web.');
                        setShowProfilePicker(null);
                      }}
                    >
                      Crear nuevo perfil desde la pestaña Perfil
                    </button>
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderComoEspaciosSection = (item: TolosItem) => {
    const linkedProfile = item.housing_profile_id ? profileCache[item.housing_profile_id] : null;
    const spaces: SpaceDetail[] = linkedProfile && Array.isArray(linkedProfile.espacios_detalle)
      ? (linkedProfile.espacios_detalle as unknown as SpaceDetail[])
      : [];
    const totalM2 = spaces.reduce((sum, s) => sum + (s.m2 || 0), 0);
    const m2Planta = linkedProfile?.m2_por_planta ? parseFloat(linkedProfile.m2_por_planta) : null;
    const numPlantas = linkedProfile?.num_plantas ? parseInt(linkedProfile.num_plantas) : null;
    const m2Construidos = m2Planta && numPlantas ? m2Planta * numPlantas : null;

    if (!linkedProfile) {
      return (
        <div className="p-4 rounded border border-dashed border-blue-300 dark:border-blue-700 text-center space-y-2">
          <Home className="h-8 w-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">Vincula primero un Perfil de vivienda para ver los espacios.</p>
          <Button size="sm" variant="outline" className="text-xs" onClick={() => setComoSub(item.id, 'perfil')}>
            <Link className="h-3 w-3 mr-1" /> Ir a Perfil
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {/* Surface summary */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 rounded border bg-background text-center">
            <p className="text-lg font-bold text-foreground">{m2Construidos ? `${m2Construidos}` : '—'}</p>
            <p className="text-[10px] text-muted-foreground uppercase">m² Construidos</p>
          </div>
          <div className="p-2 rounded border bg-background text-center">
            <p className="text-lg font-bold text-foreground">{totalM2 > 0 ? `${totalM2.toFixed(1)}` : '—'}</p>
            <p className="text-[10px] text-muted-foreground uppercase">m² Habitables</p>
          </div>
          <div className="p-2 rounded border bg-background text-center">
            <p className="text-lg font-bold text-foreground">{m2Planta ? `${m2Planta}` : '—'}</p>
            <p className="text-[10px] text-muted-foreground uppercase">m²/Planta</p>
          </div>
        </div>

        {/* Spaces from profile */}
        {spaces.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Espacios del perfil ({spaces.length})
            </p>
            <div className="border rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-xs text-muted-foreground">
                    <th className="text-left px-3 py-1.5 font-medium">Espacio</th>
                    <th className="text-right px-3 py-1.5 font-medium w-20">m² Perfil</th>
                    <th className="text-right px-3 py-1.5 font-medium w-24">m² Ejecutado</th>
                    <th className="text-center px-3 py-1.5 font-medium w-16">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {spaces.map(s => (
                    <tr key={s.id} className="border-t hover:bg-accent/20 transition-colors">
                      <td className="px-3 py-1.5 truncate">{s.name}</td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">
                        {s.m2 ? `${s.m2}` : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground/50 italic text-xs">
                        —
                      </td>
                      <td className="px-3 py-1.5 text-center text-muted-foreground/50 text-xs">
                        —
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30 font-semibold text-xs">
                    <td className="px-3 py-1.5">Total</td>
                    <td className="px-3 py-1.5 text-right">{totalM2.toFixed(1)}</td>
                    <td className="px-3 py-1.5 text-right text-muted-foreground/50">—</td>
                    <td className="px-3 py-1.5 text-center text-muted-foreground/50">—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-[10px] text-muted-foreground">
              La columna "m² Ejecutado" se completará desde el Plano. "Δ" muestra la diferencia perfil vs. ejecutado.
            </p>
          </div>
        ) : (
          <div className="p-3 rounded border border-dashed text-center">
            <p className="text-sm text-muted-foreground">El perfil vinculado no tiene espacios definidos.</p>
            <p className="text-xs text-muted-foreground mt-1">Edita el perfil desde la pestaña "Perfil" para añadir espacios.</p>
          </div>
        )}
      </div>
    );
  };

  const renderComoPlanoSection = (item: TolosItem) => {
    const linkedProfile = item.housing_profile_id ? profileCache[item.housing_profile_id] : null;

    if (!linkedProfile) {
      return (
        <div className="p-4 rounded border border-dashed border-blue-300 dark:border-blue-700 text-center space-y-2">
          <Layers className="h-8 w-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">Vincula primero un Perfil de vivienda para desarrollar el plano.</p>
          <Button size="sm" variant="outline" className="text-xs" onClick={() => setComoSub(item.id, 'perfil')}>
            <Link className="h-3 w-3 mr-1" /> Ir a Perfil
          </Button>
        </div>
      );
    }

    return (
      <div className="p-4 rounded border border-dashed border-blue-300 dark:border-blue-700 text-center space-y-2">
        <Layers className="h-8 w-8 text-blue-400 mx-auto" />
        <p className="text-sm font-medium">Plano de la vivienda</p>
        <p className="text-xs text-muted-foreground">
          Los espacios del perfil sirven como base para el desarrollo del plano.
          El editor de plano estará disponible desde esta sección.
        </p>
        <Button size="sm" variant="outline" className="text-xs" onClick={() => {
          toast.info('El editor de plano se abrirá próximamente desde este submenú.');
        }}>
          <Layers className="h-3 w-3 mr-1" /> Abrir Plano (próximamente)
        </Button>
      </div>
    );
  };

  const COMO_SUBMENUS = [
    { key: 'urbanismo', label: 'Urbanismo', icon: Landmark },
    { key: 'perfil', label: 'Perfil', icon: User },
    { key: 'espacios', label: 'Espacios', icon: Home },
    { key: 'plano', label: 'Plano', icon: Layers },
    { key: 'anteproyecto', label: 'Ante-proyecto', icon: PenTool },
    { key: 'mediciones', label: 'Mediciones', icon: RulerIcon },
    { key: 'lista-compra', label: 'Lista de Compra', icon: ShoppingCart },
    { key: 'documentos', label: 'Documentos', icon: FolderOpen },
    { key: 'agenda', label: 'Agenda', icon: CalendarDays },
    { key: 'comunicaciones', label: 'Comunicaciones', icon: MessageSquare },
    { key: 'administracion', label: 'Administración', icon: Calculator },
    { key: 'resumen', label: 'Resumen', icon: BarChart3 },
    { key: 'timeline', label: 'Timeline', icon: Timer },
    { key: 'config', label: 'Config', icon: Settings },
  ];

  const renderComoSubContent = (item: TolosItem, activeSub: string) => {
    switch (activeSub) {
      case 'urbanismo':
        return (
          <BudgetUrbanismTab
            budgetId={budgetId}
            isAdmin={isAdmin}
            cadastralReference={item.cadastral_reference || undefined}
          />
        );
      case 'perfil':
        return renderComoPerfilSection(item);
      case 'espacios':
        return renderComoEspaciosSection(item);
      case 'plano':
        return renderComoPlanoSection(item);
      case 'anteproyecto':
        return <BudgetPredesignTab budgetId={budgetId} isAdmin={isAdmin} projectId={null} />;
      case 'mediciones':
        return (
          <div className="space-y-4">
            <TolosaMeasurementsPanel budgetId={budgetId} tolosItemId={item.id} isAdmin={isAdmin} parentItemId={item.parent_id} onMeasurementChange={() => bumpMeasurementVersion(item.id)} />
            <div className="border-t pt-3">
              <h5 className="text-sm font-semibold text-muted-foreground mb-2">Todas las Mediciones del Presupuesto</h5>
              <BudgetMeasurementsTab budgetId={budgetId} isAdmin={isAdmin} />
            </div>
          </div>
        );
      case 'documentos':
        return <BudgetDocumentsTab budgetId={budgetId} projectId={null} projectName={null} isAdmin={isAdmin} />;
      case 'agenda':
        return <BudgetAgendaTab budgetId={budgetId} isAdmin={isAdmin} />;
      case 'comunicaciones':
        return <BudgetCommunicationsTab budgetId={budgetId} budgetName="" projectId={null} isAdmin={isAdmin} />;
      case 'administracion':
        return <BudgetAdministracionTab budgetId={budgetId} isAdmin={isAdmin} />;
      case 'resumen':
        return <BudgetVisualSummary budgetId={budgetId} budgetName="" />;
      case 'lista-compra':
        return <TolosaListaCompraView budgetId={budgetId} />;
      case 'timeline':
        return (
          <div className="space-y-6">
            <HierarchicalGanttView budgetId={budgetId} budgetStartDate={null} budgetEndDate={null} />
            <BudgetTimelineView budgetId={budgetId} budgetStartDate={null} budgetEndDate={null} />
          </div>
        );
      case 'config':
        return (
          <div className="space-y-6">
            <BudgetContactsManager budgetId={budgetId} isAdmin={isAdmin} />
            <BudgetVersionComparison currentBudgetId={budgetId} currentBudgetName="" currentVersion="" />
          </div>
        );
      default:
        return null;
    }
  };

  const renderComoPanel = (item: TolosItem) => {
    const activeSub = comoSubmenu[item.id] || 'urbanismo';

    return (
      <div className="space-y-3 p-3 rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold flex items-center gap-2 text-blue-700 dark:text-blue-400">
            <Wrench className="h-4 w-4" /> CÓMO?
          </h4>
          <Button size="sm" variant="ghost" className="text-xs h-7 gap-1 text-muted-foreground" onClick={() => setDimension(item.id, '')}>
            <X className="h-3 w-3" /> Cerrar
          </Button>
        </div>

        {/* Submenu tabs - scrollable */}
        <div className="flex gap-1 border-b border-blue-200 dark:border-blue-800 pb-0 overflow-x-auto">
          {COMO_SUBMENUS.map(sub => {
            const Icon = sub.icon;
            const isActive = activeSub === sub.key;
            return (
              <button
                key={sub.key}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t transition-colors border border-b-0 whitespace-nowrap ${
                  isActive
                    ? 'bg-background text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700 -mb-px z-10'
                    : 'bg-transparent text-muted-foreground hover:text-foreground border-transparent hover:bg-blue-100/50 dark:hover:bg-blue-900/30'
                }`}
                onClick={() => setComoSub(item.id, sub.key)}
              >
                <Icon className="h-3.5 w-3.5" />
                {sub.label}
              </button>
            );
          })}
        </div>

        {/* Active sub-panel */}
        <div>
          {renderComoSubContent(item, activeSub)}
        </div>
      </div>
    );
  };

  const renderDimensionPanel = (item: TolosItem, dim: string) => {
    switch (dim) {
      case 'donde': return renderDondePanel(item);
      case 'quien': return renderQuienPanel(item);
      case 'como': return renderComoPanel(item);
      case 'cuando': return (
        <div className="p-3 rounded-lg border border-purple-200 bg-purple-50/50 dark:border-purple-800 dark:bg-purple-950/30 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2 text-purple-700 dark:text-purple-400">
              <Clock className="h-4 w-4" /> CUÁNDO? — Plazos y fases
            </h4>
            <Button size="sm" variant="ghost" className="text-xs h-7 gap-1 text-muted-foreground" onClick={() => setDimension(item.id, '')}>
              <X className="h-3 w-3" /> Cerrar
            </Button>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium">Fase asociada</Label>
            <Select
              value={item.phase_id || 'none'}
              onValueChange={async (value) => {
                const newPhaseId = value === 'none' ? null : value;
                const { error } = await supabase.from('tolosa_items').update({ phase_id: newPhaseId }).eq('id', item.id);
                if (error) { toast.error('Error al guardar fase'); }
                else { toast.success('Fase actualizada'); fetchItems(); }
              }}
            >
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Seleccionar fase..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin fase</SelectItem>
                {phases.map(phase => (
                  <SelectItem key={phase.id} value={phase.id}>
                    {phase.code ? `${phase.code} — ` : ''}{phase.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {item.phase_id && (() => {
              const phase = phases.find(p => p.id === item.phase_id);
              return phase?.start_date ? (
                <p className="text-xs text-muted-foreground">
                  Inicio fase: {new Date(phase.start_date).toLocaleDateString('es-ES')}
                </p>
              ) : null;
            })()}
          </div>
        </div>
      );
      case 'cuanto': {
        const cuanto = getCuanto(item.id);
        const cuantoNormal = getCuantoNormal(item.id);
        const cuantoEst = getCuantoEst(item.id);
        return (
          <div className="p-3 rounded-lg border border-rose-200 bg-rose-50/50 dark:border-rose-800 dark:bg-rose-950/30 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-rose-700 dark:text-rose-400">
                <DollarSign className="h-4 w-4" /> CUÁNTO? — Costes
              </h4>
              <Button size="sm" variant="ghost" className="text-xs h-7 gap-1 text-muted-foreground" onClick={() => setDimension(item.id, '')}>
                <X className="h-3 w-3" /> Cerrar
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded border bg-background text-center">
                <p className="text-lg font-bold text-foreground">{formatCurrency(cuantoNormal)}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Normal (con hijos)</p>
              </div>
              <div className="p-3 rounded border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30 text-center">
                <p className="text-lg font-bold text-amber-700 dark:text-amber-400">{formatCurrency(cuantoEst)}</p>
                <p className="text-[10px] text-amber-600 dark:text-amber-500 uppercase">Est. (con hijos)</p>
              </div>
            </div>
            {cuanto > 0 && (
              <div className="p-2 rounded border bg-background text-center">
                <p className="text-xl font-bold text-foreground">{formatCurrency(cuanto)}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Total combinado</p>
              </div>
            )}
              </div>
            </div>
            <TolosaResourcesPanel
              budgetId={budgetId}
              tolosItemId={item.id}
              isAdmin={isAdmin}
              parentItemId={item.parent_id}
              onSubtotalChange={(s) => updateItemSubtotal(item.id, s)}
              measurementVersion={measurementVersions[item.id] || 0}
            />
          </div>
        );
      }
      default: return null;
    }
  };

  const renderItem = (item: TolosItem, depth: number = 0) => {
    const children = getChildren(item.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(item.id);
    const isEditing = editingId === item.id;
    const isAddingSub = addingParentId === item.id;
    const isDetailOpen = detailOpenIds.has(item.id);
    const queId = `${item.code} ${item.name}`;
    const openDim = activeDimension[item.id];

    const isEst = isEstimacionItem(item);

    return (
      <div key={item.id} className="group/item">
        <div
          className={`flex items-start gap-2 p-3 rounded-lg border-l-4 ${isEst ? 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20' : getDepthColor(depth) + ' bg-card'} hover:bg-accent/30 transition-colors`}
          style={{ marginLeft: depth * 24 }}
        >
          {/* Expand/collapse chevron - toggles children tree only, NOT the detail form */}
          <button
            onClick={() => {
              if (isExpanded) {
                // Collapse: hide children and close detail
                setExpandedIds(prev => { const n = new Set(prev); n.delete(item.id); return n; });
                if (isDetailOpen) toggleDetail(item.id);
              } else {
                // Expand: show children (don't open detail form)
                setExpandedIds(prev => new Set(prev).add(item.id));
              }
            }}
            className={`mt-0.5 p-1 rounded-md border transition-all shrink-0 ${
              isExpanded
                ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20'
                : 'bg-muted border-border text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
            title={isExpanded ? 'Colapsar' : 'Expandir'}
          >
            {isExpanded
              ? <ChevronDown className="h-4 w-4" />
              : <ChevronRight className="h-4 w-4" />
            }
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
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`font-mono text-xs shrink-0 ${isEst ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700' : ''}`}>{isEst ? 'Est.' : ''}{item.code}</Badge>
                  <button
                    onClick={() => {
                      toggleDetail(item.id);
                      // When opening detail, also expand children
                      if (!isDetailOpen && hasChildren) {
                        setExpandedIds(prev => new Set(prev).add(item.id));
                      }
                    }}
                    className="font-medium text-foreground truncate hover:underline text-left"
                  >
                    {item.name}
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const newValue = !(item.is_executed !== false);
                      try {
                        const { error } = await supabase
                          .from('tolosa_items')
                          .update({ is_executed: newValue })
                          .eq('id', item.id);
                        if (error) throw error;
                        fetchItems();
                        toast.success(`Actividad: ${newValue ? 'SÍ se ejecuta' : 'NO se ejecuta'}`);
                      } catch (err: any) {
                        toast.error('Error al actualizar');
                      }
                    }}
                    className="cursor-pointer hover:opacity-80 transition-opacity shrink-0"
                  >
                    <Badge variant={item.is_executed !== false ? 'success' : 'destructive'} className="text-xs">
                      {item.is_executed !== false ? 'SÍ' : 'NO'}
                    </Badge>
                  </button>
                  {hasChildren && (
                    <Badge
                      variant="outline"
                      className={`text-xs cursor-pointer ${isExpanded ? 'bg-primary/10 border-primary/30 text-primary' : ''}`}
                      onClick={(e) => { e.stopPropagation(); toggleExpanded(item.id); }}
                    >
                      {children.length} sub
                    </Badge>
                  )}
                  {/* Summary info: Mediciones relacionadas | Ud medida | SubTotal */}
                  {(() => {
                    const summary = itemSummaries[item.id];
                    const cuanto = getCuanto(item.id);
                    return (
                      <div className="ml-auto flex items-center gap-1.5 shrink-0">
                        {(() => {
                          const phase = item.phase_id ? phases.find(p => p.id === item.phase_id) : null;
                          return phase ? (
                            <Badge variant="outline" className="text-[10px] gap-1 border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-300">
                              <Clock className="h-2.5 w-2.5" />
                              {phase.code ? phase.code : phase.name}
                            </Badge>
                          ) : null;
                        })()}
                        {summary && summary.measurementUnits > 0 && (
                          <Badge variant="outline" className="text-[10px] font-mono gap-1">
                            <Ruler className="h-2.5 w-2.5" />
                            {formatNumber(summary.measurementUnits)} {summary.measurementUnit}
                          </Badge>
                        )}
                        {summary && summary.resourceSubtotal > 0 && (
                          <Badge variant="secondary" className="text-[10px] font-mono gap-1">
                            {formatCurrency(summary.resourceSubtotal)}
                          </Badge>
                        )}
                        {cuanto > 0 && cuanto !== (summary?.resourceSubtotal || 0) && (
                          <Badge variant="secondary" className="text-[10px] font-mono gap-1 bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                            {formatCurrency(cuanto)}
                          </Badge>
                        )}
                      </div>
                    );
                  })()}
                </div>
                {item.description && isDetailOpen && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                )}

                {/* Inline Measurements + Resources (always visible when detail open) */}
                {isDetailOpen && (
                  <div className="mt-3 space-y-3">
                    {isEst && (
                      <EstimationResourceForm
                        tolosItemId={item.id}
                        budgetId={budgetId}
                        isAdmin={isAdmin}
                      />
                    )}
                    <TolosaMeasurementsPanel
                      budgetId={budgetId}
                      tolosItemId={item.id}
                      isAdmin={isAdmin}
                      parentItemId={item.parent_id}
                      onNavigateToMeasurements={() => {
                        // Open CÓMO? > Mediciones for this item
                        setDimension(item.id, 'como');
                        setComoSub(item.id, 'mediciones');
                      }}
                      onMeasurementChange={() => bumpMeasurementVersion(item.id)}
                    />
                    <TolosaResourcesPanel
                      budgetId={budgetId}
                      tolosItemId={item.id}
                      isAdmin={isAdmin}
                      parentItemId={item.parent_id}
                      onSubtotalChange={(s) => updateItemSubtotal(item.id, s)}
                      measurementVersion={measurementVersions[item.id] || 0}
                    />
                  </div>
                )}

                {/* Dimension links panel */}
                {isDetailOpen && (
                  <div className="mt-3 space-y-3">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      QUÉ?id: {queId}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {DIMENSION_LINKS.map(dim => {
                        const Icon = dim.icon;
                        const isActive = openDim === dim.key;
                        return (
                          <button
                            key={dim.key}
                            className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-center transition-all hover:shadow-md hover:scale-[1.02] ${dim.color} ${isActive ? 'ring-2 ring-primary shadow-md' : ''}`}
                            onClick={() => setDimension(item.id, dim.key)}
                          >
                            <Icon className="h-5 w-5" />
                            <span className="text-xs font-bold">{dim.label}</span>
                            <span className="text-[10px] opacity-70">{dim.hint}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Active dimension panel */}
                    {openDim && renderDimensionPanel(item, openDim)}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Actions */}
          {!isEditing && (
            <div className="flex items-center gap-0.5 shrink-0">
              {/* Move arrows */}
              <div className="flex items-center gap-0 border rounded-md mr-1">
                <Button size="icon" variant="ghost" className="h-6 w-6 rounded-r-none" title="Subir nivel (← Outdent)"
                  onClick={() => outdentItem(item)} disabled={!item.parent_id}>
                  <ArrowLeft className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6 rounded-none border-x" title="Mover arriba"
                  onClick={() => moveItem(item, 'up')}>
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6 rounded-none" title="Mover abajo"
                  onClick={() => moveItem(item, 'down')}>
                  <ArrowDown className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6 rounded-l-none" title="Bajar nivel (→ Indent)"
                  onClick={() => indentItem(item)}>
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Añadir sub-QUÉ?"
                onClick={() => { setAddingParentId(item.id); setNewName(''); setNewDescription(''); }}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Duplicar como QUÉ?"
                onClick={() => openDuplicateDialog(item, false)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Duplicar como sub-QUÉ?"
                onClick={() => openDuplicateDialog(item, true)}>
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
            <h2 className="text-xl font-bold text-foreground">TO.LO.SA.systems 2.0</h2>
            <p className="text-sm text-muted-foreground">Brainstorming — ¿QUÉ hay que hacer?</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center border rounded-lg overflow-hidden">
            <button
              onClick={() => { setPreviousViewMode(viewMode); setViewMode('list'); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
              title="Vista Listado"
            >
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">Listado</span>
            </button>
            <button
              onClick={() => { setPreviousViewMode(viewMode); setViewMode('cards'); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'cards'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
              title="Vista Gráfico"
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Gráfico</span>
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar actividades..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 h-9 w-48"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
          <Button onClick={() => { setAddingParentId('root'); setNewName(''); setNewDescription(''); }} className="gap-2">
            <Plus className="h-4 w-4" /> Nuevo QUÉ?
          </Button>
        </div>
      </div>

      {/* Dimension legend */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          {DIMENSION_LINKS.map(dim => {
            const Icon = dim.icon;
            if (dim.key === 'cuando') {
              return (
                <button
                  key={dim.key}
                  onClick={() => setCuandoListOpen(prev => !prev)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors cursor-pointer ${dim.color} ${cuandoListOpen ? 'ring-2 ring-purple-400' : ''}`}
                >
                  <Icon className="h-3 w-3" /> {dim.label}
                </button>
              );
            }
            return (
              <Badge key={dim.key} variant="outline" className={`gap-1 ${dim.color}`}>
                <Icon className="h-3 w-3" /> {dim.label}
              </Badge>
            );
          })}
        </div>
        {/* CÓMO? submenu - horizontal */}
        <div className="flex flex-wrap gap-1 items-center pl-1">
          <span className="text-[10px] font-bold text-blue-500 dark:text-blue-400 uppercase tracking-wider mr-1">CÓMO? →</span>
          {COMO_SUBMENUS.map(sub => {
            const SubIcon = sub.icon;
            return (
              <Badge key={sub.key} variant="outline" className="gap-1 text-[10px] px-1.5 py-0.5 border-blue-200 dark:border-blue-800 text-blue-600/80 dark:text-blue-400/70 bg-blue-50/60 dark:bg-blue-950/30">
                <SubIcon className="h-2.5 w-2.5" />
                {sub.label}
              </Badge>
            );
          })}
        </div>
      </div>

      {/* CUÁNDO? Activity Listing Panel */}
      {cuandoListOpen && (
        <div className="border rounded-lg p-4 space-y-3 border-purple-200 bg-purple-50/50 dark:border-purple-800 dark:bg-purple-950/30">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2 text-purple-700 dark:text-purple-400">
              <Clock className="h-4 w-4" /> CUÁNDO? — Listado de Actividades
            </h4>
            <Button size="sm" variant="ghost" className="text-xs h-7 gap-1 text-muted-foreground" onClick={() => setCuandoListOpen(false)}>
              <X className="h-3 w-3" /> Cerrar
            </Button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant={cuandoFilter === 'all' ? 'default' : 'outline'} onClick={() => setCuandoFilter('all')} className="text-xs">
              Todas
            </Button>
            <Button size="sm" variant={cuandoFilter === 'normal' ? 'default' : 'outline'} onClick={() => setCuandoFilter('normal')} className="text-xs">
              Solo Normales
            </Button>
            <Button size="sm" variant={cuandoFilter === 'estimacion' ? 'default' : 'outline'} onClick={() => setCuandoFilter('estimacion')}
              className={`text-xs ${cuandoFilter === 'estimacion' ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}`}>
              Solo Estimaciones
            </Button>
          </div>
          {(() => {
            const filtered = items.filter(item => {
              const isEst = item.code?.includes('.E') || item.name?.includes('(Est.)');
              if (cuandoFilter === 'normal') return !isEst;
              if (cuandoFilter === 'estimacion') return isEst;
              return true;
            });

            // Group by phase
            const grouped = new Map<string, { phase: PhaseInfo | null; items: typeof filtered }>();
            const NO_PHASE_KEY = '__no_phase__';
            for (const item of filtered) {
              const phase = item.phase_id ? phases.find(p => p.id === item.phase_id) || null : null;
              const key = phase ? phase.id : NO_PHASE_KEY;
              if (!grouped.has(key)) grouped.set(key, { phase, items: [] });
              grouped.get(key)!.items.push(item);
            }

            // Sort groups: phases with code first (by code), then unnamed phases, then "Sin fase" last
            const sortedGroups = [...grouped.entries()].sort(([kA, gA], [kB, gB]) => {
              if (kA === NO_PHASE_KEY) return 1;
              if (kB === NO_PHASE_KEY) return -1;
              const cA = gA.phase?.code || '';
              const cB = gB.phase?.code || '';
              if (cA && cB) return cA.localeCompare(cB, undefined, { numeric: true });
              if (cA) return -1;
              if (cB) return 1;
              return (gA.phase?.name || '').localeCompare(gB.phase?.name || '');
            });

            // Sort items within each group by code
            for (const [, g] of sortedGroups) {
              g.items.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));
            }

            let grandSubtotal = 0;
            let grandVat = 0;
            let grandTotal = 0;
            filtered.forEach(item => {
              const sub = itemSubtotals[item.id] || 0;
              grandSubtotal += sub;
              grandVat += sub * 0.21;
              grandTotal += sub + sub * 0.21;
            });

            return (
              <div className="space-y-2">
                {sortedGroups.map(([groupKey, group]) => {
                  let groupSub = 0;
                  let groupVat = 0;
                  group.items.forEach(item => {
                    const sub = itemSubtotals[item.id] || 0;
                    groupSub += sub;
                    groupVat += sub * 0.21;
                  });
                  const groupTotal = groupSub + groupVat;
                  const phaseLabel = group.phase
                    ? (group.phase.code ? `${group.phase.code} — ${group.phase.name}` : group.phase.name)
                    : 'Sin fase asignada';

                  return (
                    <Collapsible key={groupKey} defaultOpen className="group">
                      <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 rounded-md bg-muted/40 hover:bg-muted/60 transition-colors text-left">
                        <div className="flex items-center gap-2">
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                          <span className="text-xs font-semibold text-purple-700 dark:text-purple-400">{phaseLabel}</span>
                          <Badge variant="outline" className="text-[9px] h-4">{group.items.length}</Badge>
                        </div>
                        <span className="text-[10px] font-mono font-semibold text-foreground">{groupSub > 0 ? formatCurrency(groupTotal) : '—'}</span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border rounded overflow-hidden mt-1 ml-4">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-muted/50 text-xs text-muted-foreground">
                                <th className="text-left px-3 py-1 font-medium">Código</th>
                                <th className="text-left px-3 py-1 font-medium">Actividad</th>
                                <th className="text-right px-3 py-1 font-medium">Subtotal</th>
                                <th className="text-right px-3 py-1 font-medium">IVA</th>
                                <th className="text-right px-3 py-1 font-medium">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.items.map(item => {
                                const isEst = item.code?.includes('.E') || item.name?.includes('(Est.)');
                                const sub = itemSubtotals[item.id] || 0;
                                const vatAmount = sub * 0.21;
                                const total = sub + vatAmount;
                                return (
                                  <tr key={item.id} className={`border-t hover:bg-accent/20 transition-colors ${isEst ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''}`}>
                                    <td className="px-3 py-1.5 font-mono text-xs">
                                      <Badge variant="outline" className={`text-[10px] ${isEst ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/60 dark:text-amber-300' : ''}`}>
                                        {item.code}
                                      </Badge>
                                    </td>
                                    <td className="px-3 py-1.5 truncate max-w-[200px]">{item.name}</td>
                                    <td className="px-3 py-1.5 text-right font-mono text-xs">{sub > 0 ? formatCurrency(sub) : '—'}</td>
                                    <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">{sub > 0 ? formatCurrency(vatAmount) : '—'}</td>
                                    <td className="px-3 py-1.5 text-right font-mono text-xs font-semibold">{sub > 0 ? formatCurrency(total) : '—'}</td>
                                  </tr>
                                );
                              })}
                              <tr className="border-t bg-muted/20 text-xs font-medium">
                                <td colSpan={2} className="px-3 py-1.5 text-muted-foreground">Subtotal fase</td>
                                <td className="px-3 py-1.5 text-right font-mono">{groupSub > 0 ? formatCurrency(groupSub) : '—'}</td>
                                <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{groupVat > 0 ? formatCurrency(groupVat) : '—'}</td>
                                <td className="px-3 py-1.5 text-right font-mono font-semibold">{groupTotal > 0 ? formatCurrency(groupTotal) : '—'}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}

                {/* Grand total */}
                <div className="flex items-center justify-between px-3 py-2 rounded-md bg-purple-100/60 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800">
                  <span className="text-xs font-semibold text-purple-700 dark:text-purple-400">
                    Total ({filtered.length} actividades)
                  </span>
                  <div className="flex gap-4 text-xs font-mono">
                    <span>{formatCurrency(grandSubtotal)}</span>
                    <span className="text-muted-foreground">{formatCurrency(grandVat)}</span>
                    <span className="font-bold">{formatCurrency(grandTotal)}</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}


      <div className="flex items-center gap-3">
        <Button
          variant={showOnlyExecuted ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowOnlyExecuted(!showOnlyExecuted)}
        >
          <Eye className="h-4 w-4 mr-1" />
          {showOnlyExecuted ? 'Solo las que SÍ se ejecutan' : 'Listar todas'}
        </Button>
        <span className="text-xs text-muted-foreground">
          {items.filter(i => !showOnlyExecuted || i.is_executed !== false).length} de {items.length} ítems
        </span>
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
      ) : viewMode === 'cards' ? (
        <TolosaCardView
          items={items.filter(i => isItemVisible(i))}
          itemSummaries={itemSummaries}
          itemSubtotals={itemSubtotals}
          contactCache={contactCache}
          phases={phases}
          getCuanto={getCuanto}
          initialFocusId={lastWorkedItemId}
          onItemClick={(itemId) => {
            // Single click handled by TolosaCardView drill-down internally
          }}
          onItemDoubleClick={(itemId) => {
            // Double click: switch to list view and open item detail
            setPreviousViewMode('cards');
            setLastWorkedItemId(itemId);
            setViewMode('list');
            setExpandedIds(prev => {
              const next = new Set(prev);
              let current = items.find(i => i.id === itemId);
              while (current?.parent_id) {
                next.add(current.parent_id);
                current = items.find(i => i.id === current!.parent_id);
              }
              next.add(itemId);
              return next;
            });
            setDetailOpenIds(prev => {
              const n = new Set(prev);
              n.add(itemId);
              return n;
            });
          }}
          onEditItem={(itemId) => {
            // Edit button in graph card: switch to list view and open item detail form
            setGraphEntryItemId(itemId); // remember origin for return navigation
            setLastWorkedItemId(itemId);
            setPreviousViewMode('cards');
            setViewMode('list');
            setExpandedIds(prev => {
              const next = new Set(prev);
              let current = items.find(i => i.id === itemId);
              while (current?.parent_id) {
                next.add(current.parent_id);
                current = items.find(i => i.id === current!.parent_id);
              }
              return next;
            });
            setDetailOpenIds(prev => {
              const n = new Set(prev);
              n.add(itemId);
              return n;
            });
          }}
          onOpenFullDetail={(itemId) => {
            setFullDetailItemId(itemId);
            setLastWorkedItemId(itemId);
          }}
          onUpdateItem={handleUpdateItemFromGraph}
          onAddSibling={(parentId, name) => {
            handleAddFromGraph(parentId, name);
          }}
          onAddChild={(parentId, name) => {
            handleAddFromGraph(parentId, name);
          }}
          onDeleteItem={handleDeleteById}
          onDuplicate={(item, asSub) => openDuplicateDialog(item as any, asSub)}
        />
      ) : (
        <div className="space-y-1">
          {rootItems.map(item => renderItem(item, 0))}
        </div>
      )}

      {/* Full-detail dialog from graph mode */}
      {fullDetailItemId && (() => {
        const detailItem = items.find(i => i.id === fullDetailItemId);
        if (!detailItem) return null;
        const cuanto = getCuanto(detailItem.id);
        return (
          <Dialog open={true} onOpenChange={(open) => { if (!open) setFullDetailItemId(null); }}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs">{detailItem.code}</Badge>
                  {detailItem.name}
                  {cuanto > 0 && (
                    <Badge variant="secondary" className="ml-auto text-xs font-mono">{formatCurrency(cuanto)}</Badge>
                  )}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {detailItem.description && (
                  <p className="text-sm text-muted-foreground">{detailItem.description}</p>
                )}
                {/* Estimation form */}
                {(detailItem.code?.includes('.E') || detailItem.name?.includes('(Est.)')) && (
                  <EstimationResourceForm
                    tolosItemId={detailItem.id}
                    budgetId={budgetId}
                    isAdmin={isAdmin}
                  />
                )}
                {/* Mediciones */}
                <TolosaMeasurementsPanel
                  budgetId={budgetId}
                  tolosItemId={detailItem.id}
                  isAdmin={isAdmin}
                  parentItemId={detailItem.parent_id}
                  onNavigateToMeasurements={() => {}}
                  onMeasurementChange={() => bumpMeasurementVersion(detailItem.id)}
                />
                {/* Recursos */}
                <TolosaResourcesPanel
                  budgetId={budgetId}
                  tolosItemId={detailItem.id}
                  isAdmin={isAdmin}
                  parentItemId={detailItem.parent_id}
                  onSubtotalChange={(s) => updateItemSubtotal(detailItem.id, s)}
                  measurementVersion={measurementVersions[detailItem.id] || 0}
                />
                {/* Dimension links */}
                <div className="space-y-3 border-t pt-3">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {DIMENSION_LINKS.map(dim => {
                      const Icon = dim.icon;
                      const isActive = activeDimension[detailItem.id] === dim.key;
                      return (
                        <button
                          key={dim.key}
                          className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-center transition-all hover:shadow-md hover:scale-[1.02] ${dim.color} ${isActive ? 'ring-2 ring-primary shadow-md' : ''}`}
                          onClick={() => setDimension(detailItem.id, dim.key)}
                        >
                          <Icon className="h-5 w-5" />
                          <span className="text-xs font-bold">{dim.label}</span>
                          <span className="text-[10px] opacity-70">{dim.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                  {activeDimension[detailItem.id] && renderDimensionPanel(detailItem, activeDimension[detailItem.id])}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Back button when in list mode from graph */}
      {viewMode === 'list' && previousViewMode === 'cards' && (
        <div className="flex justify-start">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              // Close all open details and return to graph
              setDetailOpenIds(new Set());
              setGraphEntryItemId(null);
              setPreviousViewMode(null);
              setViewMode('cards');
            }}
          >
            <ArrowLeftCircle className="h-4 w-4" />
            Volver al Gráfico
          </Button>
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

      {/* Delete confirmation dialog for items with descendants */}
      {deleteConfirm && (
        <Dialog open={true} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Eliminar "{deleteConfirm.item.name}"</DialogTitle>
              <DialogDescription>
                Este ítem tiene <strong>{deleteConfirm.descendants.length}</strong> descendiente{deleteConfirm.descendants.length > 1 ? 's' : ''}.
                ¿Qué deseas hacer?
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-40 overflow-y-auto border rounded p-2 bg-muted/30">
              {deleteConfirm.descendants.map(d => (
                <div key={d.id} className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="font-mono text-[10px] shrink-0">{d.code}</Badge>
                  <span className="truncate">{d.name}</span>
                </div>
              ))}
            </div>
            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleDeleteWithDescendants}>
                <Trash2 className="h-4 w-4 mr-1" /> Eliminar todo ({deleteConfirm.descendants.length + 1})
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Duplicate Dialog */}
      <Dialog open={dupDialogOpen} onOpenChange={(open) => { if (!open) { setDupDialogOpen(false); setDupItem(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicar "{dupItem?.name}"</DialogTitle>
            <DialogDescription>
              Elige el tipo de copia a crear.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Tipo de copia</Label>
              <div className="flex gap-2">
                <Button
                  variant={dupType === 'normal' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => { setDupType('normal'); setDupName(prev => prev.replace(' (Est.)', ' (copia)')); }}
                >
                  Normal
                </Button>
                <Button
                  variant={dupType === 'estimacion' ? 'default' : 'outline'}
                  size="sm"
                  className={dupType === 'estimacion' ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}
                  onClick={() => { setDupType('estimacion'); setDupName(prev => prev.replace(' (copia)', ' (Est.)')); }}
                >
                  Estimación
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Nombre</Label>
              <Input value={dupName} onChange={(e) => setDupName(e.target.value)} />
            </div>
            {dupType === 'estimacion' && (
              <div className="space-y-3 border-t pt-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Unidades</Label>
                    <Input type="number" value={dupUnits} onChange={(e) => setDupUnits(e.target.value)} min="0" step="0.01" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Importe / Ud</Label>
                    <Input type="number" value={dupUnitPrice} onChange={(e) => setDupUnitPrice(e.target.value)} min="0" step="0.01" placeholder="0.00" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">% IVA</Label>
                  <Select value={dupVatPercent} onValueChange={setDupVatPercent}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0%</SelectItem>
                      <SelectItem value="4">4%</SelectItem>
                      <SelectItem value="10">10%</SelectItem>
                      <SelectItem value="21">21%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(() => {
                  const subtotal = (parseFloat(dupUnits) || 0) * (parseFloat(dupUnitPrice) || 0);
                  const vat = parseFloat(dupVatPercent) || 0;
                  const totalWithVat = subtotal * (1 + vat / 100);
                  return (
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Total (sin IVA)</p>
                        <p className="text-sm font-semibold">{formatCurrency(subtotal)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Total (IVA incl.)</p>
                        <p className="text-sm font-bold text-primary">{formatCurrency(totalWithVat)}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDupDialogOpen(false); setDupItem(null); }}>Cancelar</Button>
            <Button onClick={executeDuplicate}>
              <Copy className="h-4 w-4 mr-1" />
              {dupType === 'estimacion' ? 'Crear Estimación' : 'Duplicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Self-contained Lista de Compra for Tolosa QUÉ? ───────────────────────────
function TolosaListaCompraView({ budgetId }: { budgetId: string }) {
  const [phases, setPhases] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [{ data: ph }, { data: ac }, { data: re }] = await Promise.all([
        supabase.from('budget_phases').select('*').eq('budget_id', budgetId).order('order_index'),
        supabase.from('budget_activities').select('*').eq('budget_id', budgetId).order('name'),
        supabase.from('budget_activity_resources').select('*').eq('budget_id', budgetId).order('name'),
      ]);
      setPhases(ph || []);
      setActivities(ac || []);
      setResources(re || []);
      setLoading(false);
    };
    load();
  }, [budgetId]);

  if (loading) return <div className="text-sm text-muted-foreground py-4 text-center">Cargando lista de compra…</div>;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 pb-2 border-b">
        <ShoppingCart className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Lista de Compra del Presupuesto</span>
      </div>
      <BuyingListUnified
        budgetId={budgetId}
        resources={resources}
        phases={phases}
        activities={activities}
      />
    </div>
  );
}