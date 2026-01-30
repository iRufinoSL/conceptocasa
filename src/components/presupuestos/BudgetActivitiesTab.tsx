import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Search, Upload, Pencil, Trash2, MoreHorizontal, FileUp, File, X, Download, ChevronRight, ChevronDown, ChevronLeft, List, Layers, Copy, Package, Wrench, Truck, Briefcase, CheckSquare, Eye, ArrowUpDown, ArrowUp, ArrowDown, FileDown, Clock, MapPin, Settings2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { toast } from 'sonner';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { searchMatch } from '@/lib/search-utils';
import { OPTION_COLORS } from '@/lib/options-utils';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format-utils';
import { percentToRatio } from '@/lib/budget-pricing';
import { syncActivityResourcesRelatedUnits } from '@/lib/budget-utils';
import { MeasurementInlineSelect, MeasurementInlineSelectHandle } from './MeasurementInlineSelect';
import { WorkAreaInlineSelect } from './WorkAreaInlineSelect';
import { ResourceInlineEdit } from './ResourceInlineEdit';
import { BudgetResourceForm } from './BudgetResourceForm';
import { ActivitiesWorkAreaGroupedView } from './ActivitiesWorkAreaGroupedView';
import { ActivitiesBulkEditBar } from './ActivitiesBulkEditBar';
import { ActivitiesOptionsGroupedView } from './ActivitiesOptionsGroupedView';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { usePermissions, canAccessActivity, BudgetPermissions } from '@/hooks/usePermissions';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, addDays, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useBudgetBroadcast } from '@/hooks/useBudgetBroadcast';
interface WorkArea {
  id: string;
  name: string;
  level: string;
  work_area: string;
  area_id: string;
}

interface WorkAreaRelation {
  activity_id: string;
  work_area_id: string;
}

interface BudgetPhase {
  id: string;
  name: string;
  code: string | null;
  start_date: string | null;
}

interface BudgetActivity {
  id: string;
  budget_id: string;
  name: string;
  code: string;
  description: string | null;
  measurement_unit: string;
  phase_id: string | null;
  measurement_id: string | null;
  uses_measurement: boolean;
  opciones: string[];
  created_at: string;
  files_count?: number;
  resources_subtotal?: number;
  start_date: string | null;
  duration_days: number | null;
  tolerance_days: number | null;
  end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
}

interface Measurement {
  id: string;
  name: string;
  manual_units: number | null;
  measurement_unit: string | null;
}

interface MeasurementRelation {
  measurement_id: string;
  related_measurement_id: string;
}

interface ActivityFile {
  id: string;
  activity_id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number;
  created_at: string;
}

interface ActivityResource {
  id: string;
  name: string;
  external_unit_cost: number | null;
  unit: string | null;
  resource_type: string | null;
  safety_margin_percent: number | null;
  sales_margin_percent: number | null;
  manual_units: number | null;
  related_units: number | null;
}

type ExistingBudgetResource = ActivityResource & { activity_id: string | null };

interface ActivityForm {
  name: string;
  code: string;
  description: string;
  measurement_unit: string;
  phase_id: string;
  measurement_id: string;
  uses_measurement: boolean;
  opciones: string[];
  start_date: string;
  duration_days: string;
  tolerance_days: string;
  work_area_ids: string[];
  actual_start_date: string;
  actual_end_date: string;
}

interface BudgetActivitiesTabProps {
  budgetId: string;
  budgetName: string;
  isAdmin: boolean;
  budgetStartDate?: string | null;
  budgetEndDate?: string | null;
  initialActivityId?: string | null;
  onClearInitialActivityId?: () => void;
}

// Format for PDF (simpler format without symbols)
const formatPdfCurrency = (value: number): string => {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(value) + ' €';
};

const MEASUREMENT_UNITS = [
  'm2', 'm3', 'ml', 'mes', 'ud', 'kg', 'l', 'h', 'día', 'semana', 'pa'
].sort((a, b) => a.localeCompare(b));

const emptyForm: ActivityForm = {
  name: '',
  code: '',
  description: '',
  measurement_unit: 'ud',
  phase_id: '',
  measurement_id: '',
  uses_measurement: true,
  opciones: ['A', 'B', 'C'],
  start_date: '',
  duration_days: '',
  tolerance_days: '',
  work_area_ids: [],
  actual_start_date: '',
  actual_end_date: '',
};

export function BudgetActivitiesTab({ budgetId, budgetName, isAdmin, budgetStartDate, budgetEndDate, initialActivityId, onClearInitialActivityId }: BudgetActivitiesTabProps) {
  const { settings: companySettings } = useCompanySettings();
  const permissions = usePermissions(budgetId);
  const [activities, setActivities] = useState<BudgetActivity[]>([]);
  const [phases, setPhases] = useState<BudgetPhase[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [measurementRelations, setMeasurementRelations] = useState<MeasurementRelation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'alphabetical' | 'grouped' | 'workarea' | 'time' | 'options'>('alphabetical');
  const [selectedActivityIds, setSelectedActivityIds] = useState<Set<string>>(new Set());
  const [expandedOptions, setExpandedOptions] = useState<Set<string>>(new Set());
  const [activitySortOrder, setActivitySortOrder] = useState<'asc' | 'desc'>('asc');
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [workAreas, setWorkAreas] = useState<WorkArea[]>([]);
  const [workAreaRelations, setWorkAreaRelations] = useState<WorkAreaRelation[]>([]);
  const [unassignedResourcesSubtotal, setUnassignedResourcesSubtotal] = useState(0);
  
  // Dialog states
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [filesDialogOpen, setFilesDialogOpen] = useState(false);
  
  const [editingActivity, setEditingActivity] = useState<BudgetActivity | null>(null);
  const [deletingActivity, setDeletingActivity] = useState<BudgetActivity | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<BudgetActivity | null>(null);
  const [activityFiles, setActivityFiles] = useState<ActivityFile[]>([]);
  const [activityResources, setActivityResources] = useState<ActivityResource[]>([]);
  const [resourceDetailDialogOpen, setResourceDetailDialogOpen] = useState(false);
  const [viewingResource, setViewingResource] = useState<ActivityResource | null>(null);
  const [duplicateResourceDialogOpen, setDuplicateResourceDialogOpen] = useState(false);
  const [duplicatingResource, setDuplicatingResource] = useState<ActivityResource | null>(null);
  const [duplicateResourceName, setDuplicateResourceName] = useState('');
  const [resourceFormOpen, setResourceFormOpen] = useState(false);
  const [editingResourceForForm, setEditingResourceForForm] = useState<any>(null);

  const [existingResourcePickerOpen, setExistingResourcePickerOpen] = useState(false);
  const [existingResources, setExistingResources] = useState<ExistingBudgetResource[]>([]);
  const [existingResourcesLoading, setExistingResourcesLoading] = useState(false);
  const [existingResourcesQuery, setExistingResourcesQuery] = useState('');
  const [form, setForm] = useState<ActivityForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [workAreaSearchQuery, setWorkAreaSearchQuery] = useState('');
  const [showAllWorkAreas, setShowAllWorkAreas] = useState(false);
  const [returnTabAfterSave, setReturnTabAfterSave] = useState<string | null>(null);

  // Ref to hold fetchData so broadcast callback can access it
  const fetchDataRef = useRef<() => Promise<void>>();

  // Instant broadcast for cross-client sync
  const handleBroadcast = useCallback((payload: any) => {
    // When another client broadcasts a change, refetch immediately
    if (payload.type === 'activity-changed' || payload.type === 'resource-changed') {
      fetchDataRef.current?.();
    }
  }, []);

  const { broadcastActivityChange, broadcastResourceChange } = useBudgetBroadcast({
    budgetId,
    onBroadcast: handleBroadcast,
  });
  // Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activityFileInputRef = useRef<HTMLInputElement>(null);

  // Tab navigation refs for inline editing
  const cellRefs = useRef<Map<string, MeasurementInlineSelectHandle | null>>(new Map());
  const getCellKey = (activityId: string) => activityId;

  // Serialize per-activity work-area updates to avoid race conditions on fast inline toggles
  const workAreaUpdateChainRef = useRef<Map<string, Promise<void>>>(new Map());

  const normalizeIds = useCallback((ids: string[]) => {
    // Defensive: de-duplicate and drop falsy values
    return Array.from(new Set(ids.filter(Boolean)));
  }, []);

  const enqueueWorkAreaUpdate = useCallback(
    (activityId: string, fn: () => Promise<void>) => {
      const chain = workAreaUpdateChainRef.current;
      const prev = chain.get(activityId) ?? Promise.resolve();
      const next = prev.then(fn).catch((err) => {
        // Swallow here to keep the chain alive; error handling is done in fn.
        console.error('Work area update chain error:', err);
      });
      chain.set(activityId, next);
      return next;
    },
    []
  );

  // Get sorted activities for navigation
  const sortedActivities = useMemo(() => {
    return [...activities].sort((a, b) => a.name.localeCompare(b.name));
  }, [activities]);

  // Focus a specific cell
  const focusCell = useCallback((activityId: string) => {
    const key = getCellKey(activityId);
    const element = cellRefs.current.get(key);
    if (element) {
      element.focus();
      element.click();
    }
  }, []);

  // Navigate to next/prev activity's measurement field
  const navigateToMeasurementField = useCallback((currentActivityId: string, direction: 'next' | 'prev') => {
    const currentIndex = sortedActivities.findIndex(a => a.id === currentActivityId);
    if (currentIndex === -1) return;

    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

    // Check bounds
    if (nextIndex < 0 || nextIndex >= sortedActivities.length) return;

    const nextActivity = sortedActivities[nextIndex];
    focusCell(nextActivity.id);
  }, [sortedActivities, focusCell]);

  // Navigate to row above/below (arrow keys)
  const navigateToRow = useCallback((currentActivityId: string, direction: 'up' | 'down') => {
    const currentIndex = sortedActivities.findIndex(a => a.id === currentActivityId);
    if (currentIndex === -1) return;

    const nextIndex = direction === 'down' ? currentIndex + 1 : currentIndex - 1;

    // Check bounds
    if (nextIndex < 0 || nextIndex >= sortedActivities.length) return;

    const nextActivity = sortedActivities[nextIndex];
    focusCell(nextActivity.id);
  }, [sortedActivities, focusCell]);

  // Register cell ref
  const registerCellRef = useCallback((activityId: string, el: MeasurementInlineSelectHandle | null) => {
    cellRefs.current.set(getCellKey(activityId), el);
  }, []);

  // Calculate resource subtotal for an activity (with live measurement data)
  // Uses passed-in measurements data to avoid stale state issues
  const calculateResourceSubtotal = (
    resources: any[],
    activityMeasurementId?: string | null,
    measurementsList?: Measurement[],
    relationsList?: MeasurementRelation[]
  ) => {
    // Use passed-in data or fall back to state
    const measurementsData = measurementsList || measurements;
    const relationsData = relationsList || measurementRelations;

    // Calculate live related units from measurement if available
    let liveRelatedUnits = 0;
    if (activityMeasurementId) {
      const measurement = measurementsData.find(m => m.id === activityMeasurementId);
      if (measurement) {
        const relatedMeasurementIds = relationsData
          .filter(r => r.measurement_id === measurement.id)
          .map(r => r.related_measurement_id);

        if (relatedMeasurementIds.length > 0) {
          const sum = relatedMeasurementIds.reduce((acc, relId) => {
            const relMeasurement = measurementsData.find(m => m.id === relId);
            return acc + (relMeasurement?.manual_units || 0);
          }, 0);

          // Important: if relations exist but sum is 0 (legacy imports / empty relations),
          // treat as "no effective relations" and use the measurement's own units.
          liveRelatedUnits = sum > 0 ? sum : (measurement.manual_units || 0);
        } else {
          liveRelatedUnits = measurement.manual_units || 0;
        }
      }
    }

    return resources.reduce((total, resource) => {
      const externalCost = resource.external_unit_cost || 0;
      const safetyRatio = percentToRatio(resource.safety_margin_percent, 0.15);
      const salesRatio = percentToRatio(resource.sales_margin_percent, 0.25);

      const salesCostUd = externalCost * (1 + safetyRatio) * (1 + salesRatio);

      // Use live related units if available, otherwise fallback to stored value
      const relatedUnits = activityMeasurementId ? liveRelatedUnits : (resource.related_units || 0);
      const calculatedUnits = resource.manual_units !== null
        ? resource.manual_units
        : relatedUnits;

      return total + (calculatedUnits * salesCostUd);
    }, 0);
  };

  // Fetch activities and phases
  const fetchData = async () => {
    try {
      const [activitiesRes, phasesRes, resourcesRes, measurementsRes, measurementRelationsRes, workAreasRes, workAreaRelationsRes] = await Promise.all([
        supabase
          .from('budget_activities')
          .select('*')
          .eq('budget_id', budgetId)
          .order('name', { ascending: true }),
        supabase
          .from('budget_phases')
          .select('id, name, code, start_date')
          .eq('budget_id', budgetId)
          .order('code', { ascending: true }),
        supabase
          .from('budget_activity_resources')
          .select('*')
          .eq('budget_id', budgetId),
        supabase
          .from('budget_measurements')
          .select('id, name, manual_units, measurement_unit')
          .eq('budget_id', budgetId),
        supabase
          .from('budget_measurement_relations')
          .select('measurement_id, related_measurement_id'),
        supabase
          .from('budget_work_areas')
          .select('id, name, level, work_area, area_id')
          .eq('budget_id', budgetId)
          .order('area_id', { ascending: true }),
        supabase
          .from('budget_work_area_activities')
          .select('activity_id, work_area_id')
      ]);

      if (activitiesRes.error) throw activitiesRes.error;
      if (phasesRes.error) throw phasesRes.error;
      if (resourcesRes.error) throw resourcesRes.error;
      if (measurementsRes.error) throw measurementsRes.error;
      if (measurementRelationsRes.error) throw measurementRelationsRes.error;
      if (workAreasRes.error) throw workAreasRes.error;
      if (workAreaRelationsRes.error) throw workAreaRelationsRes.error;

      const allResources = resourcesRes.data || [];

      // Prepare measurements data FIRST so we can use it in subtotal calculations
      const measurementsList = measurementsRes.data || [];
      const measurementIds = measurementsList.map(m => m.id);
      const filteredRelations = (measurementRelationsRes.data || []).filter(
        r => measurementIds.includes(r.measurement_id)
      );

      // Resources without activity_id are real budget resources; treat them as "A+B+C".
      const resourcesWithoutActivity = allResources.filter(r => !r.activity_id);
      const resourcesWithoutActivitySubtotal = calculateResourceSubtotal(
        resourcesWithoutActivity,
        null,
        measurementsList,
        filteredRelations
      );
      setUnassignedResourcesSubtotal(resourcesWithoutActivitySubtotal);

      // Filter work area relations to only those for activities in this budget
      const activityIds = (activitiesRes.data || []).map(a => a.id);
      const filteredWorkAreaRelations = (workAreaRelationsRes.data || []).filter(
        r => activityIds.includes(r.activity_id)
      );

      // Get file counts and resource subtotals for each activity
      // Pass fresh measurement data to avoid stale state issues
      const activitiesWithData = await Promise.all(
        (activitiesRes.data || []).map(async (activity) => {
          const { count } = await supabase
            .from('budget_activity_files')
            .select('*', { count: 'exact', head: true })
            .eq('activity_id', activity.id);

          // Calculate resources subtotal using fresh measurement data
          const activityResources = allResources.filter(r => r.activity_id === activity.id);
          const resourcesSubtotal = calculateResourceSubtotal(
            activityResources,
            activity.uses_measurement !== false ? activity.measurement_id : null,
            measurementsList,
            filteredRelations
          );

          return {
            ...activity,
            files_count: count || 0,
            resources_subtotal: resourcesSubtotal
          };
        })
      );

      setActivities(activitiesWithData);
      setPhases(phasesRes.data || []);
      setMeasurements(measurementsList);
      setMeasurementRelations(filteredRelations);
      setWorkAreas(workAreasRes.data || []);
      setWorkAreaRelations(filteredWorkAreaRelations);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      toast.error('Error al cargar datos');
    } finally {
      setIsLoading(false);
    }
  };

  // Update ref so broadcast callback can call fetchData
  fetchDataRef.current = fetchData;
  useEffect(() => {
    const channel = supabase
      .channel('budget-work-area-activities-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'budget_work_area_activities'
        },
        (payload) => {
          console.log('Work area relation change:', payload);
          // Refetch work area relations when changes occur
          const fetchWorkAreaRelations = async () => {
            const { data: workAreaRelationsRes } = await supabase
              .from('budget_work_area_activities')
              .select('activity_id, work_area_id');
            
            if (workAreaRelationsRes) {
              // Filter to only activities in this budget
              const activityIds = activities.map(a => a.id);
              const filteredRelations = workAreaRelationsRes.filter(
                r => activityIds.includes(r.activity_id)
              );
              setWorkAreaRelations(filteredRelations);
            }
          };
          fetchWorkAreaRelations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activities]);

  useEffect(() => {
    fetchData();
  }, [budgetId]);

  // Listen for edit-activity events from BudgetPhasesTab
  useEffect(() => {
    const handleEditActivity = async (e: Event) => {
      const customEvent = e as CustomEvent;
      const activityData = customEvent.detail;
      if (activityData && activityData.id) {
        // Store return tab if provided (e.g., 'areas-trabajo' from DÓNDE?)
        if (activityData.returnTab) {
          setReturnTabAfterSave(activityData.returnTab);
        } else {
          setReturnTabAfterSave(null);
        }
        
        // Find the full activity in our state or fetch it
        const fullActivity = activities.find(a => a.id === activityData.id);
        if (fullActivity) {
          handleEdit(fullActivity);
        } else {
          // Activity might not be loaded yet, fetch and edit
          const [activityRes, workAreaLinksRes] = await Promise.all([
            supabase
              .from('budget_activities')
              .select('*')
              .eq('id', activityData.id)
              .single(),
            supabase
              .from('budget_work_area_activities')
              .select('work_area_id')
              .eq('activity_id', activityData.id)
          ]);
          
          const data = activityRes.data;
          if (data) {
            setEditingActivity(data);
            setForm({
              name: data.name,
              code: data.code,
              description: data.description || '',
              measurement_unit: data.measurement_unit,
              phase_id: data.phase_id || '',
              measurement_id: data.measurement_id || '',
              uses_measurement: data.uses_measurement ?? true,
              opciones: data.opciones || ['A', 'B', 'C'],
              start_date: data.start_date || '',
              duration_days: data.duration_days?.toString() || '',
              tolerance_days: data.tolerance_days?.toString() || '',
              work_area_ids: (workAreaLinksRes.data || []).map(r => r.work_area_id),
              actual_start_date: data.actual_start_date || '',
              actual_end_date: data.actual_end_date || '',
            });
            setWorkAreaSearchQuery('');
            setShowAllWorkAreas(false);
            setFormDialogOpen(true);
          }
        }
      }
    };

    window.addEventListener('edit-activity', handleEditActivity);
    return () => window.removeEventListener('edit-activity', handleEditActivity);
  }, [activities]);

  // Handle initialActivityId - open activity form when navigating from another tab
  useEffect(() => {
    if (!initialActivityId || isLoading || activities.length === 0) return;
    
    const activity = activities.find(a => a.id === initialActivityId);
    if (activity) {
      handleEdit(activity);
      // Clear the initialActivityId after opening the form
      onClearInitialActivityId?.();
    }
  }, [initialActivityId, isLoading, activities, onClearInitialActivityId]);

  // Listen for budget recalculation events
  useEffect(() => {
    const handleRecalculated = () => {
      fetchData();
    };
    window.addEventListener('budget-recalculated', handleRecalculated);
    return () => window.removeEventListener('budget-recalculated', handleRecalculated);
  }, []);

  // Open form for new activity
  const handleNew = () => {
    setEditingActivity(null);
    setForm(emptyForm);
    setActivityResources([]);
    setWorkAreaSearchQuery('');
    setShowAllWorkAreas(false);
    setFormDialogOpen(true);
  };

  // Fetch resources for an activity
  const fetchActivityResources = async (activityId: string) => {
    const { data, error } = await supabase
      .from('budget_activity_resources')
      .select('id, name, external_unit_cost, unit, resource_type, safety_margin_percent, sales_margin_percent, manual_units, related_units')
      .eq('activity_id', activityId)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching resources:', error);
      return [];
    }
    return data || [];
  };

  // Open form for editing
  const handleEdit = async (activity: BudgetActivity) => {
    setEditingActivity(activity);
    setForm({
      name: activity.name,
      code: activity.code,
      description: activity.description || '',
      measurement_unit: activity.measurement_unit,
      phase_id: activity.phase_id || '',
      measurement_id: activity.measurement_id || '',
      uses_measurement: activity.uses_measurement ?? true,
      opciones: activity.opciones || ['A', 'B', 'C'],
      start_date: activity.start_date || '',
      duration_days: activity.duration_days?.toString() || '',
      tolerance_days: activity.tolerance_days?.toString() || '',
      work_area_ids: workAreaRelations.filter(r => r.activity_id === activity.id).map(r => r.work_area_id),
      actual_start_date: activity.actual_start_date || '',
      actual_end_date: activity.actual_end_date || '',
    });
    
    // Reset search state
    setWorkAreaSearchQuery('');
    setShowAllWorkAreas(false);
    
    // Fetch resources for this activity
    const resources = await fetchActivityResources(activity.id);
    setActivityResources(resources);
    
    setFormDialogOpen(true);
  };

  // Open picker to select an existing resource (will duplicate it into this activity)
  const openExistingResourcePicker = async () => {
    if (!editingActivity) return;

    setExistingResourcesQuery('');
    setExistingResourcePickerOpen(true);
    setExistingResourcesLoading(true);

    try {
      const { data, error } = await supabase
        .from('budget_activity_resources')
        .select('id, name, external_unit_cost, unit, resource_type, safety_margin_percent, sales_margin_percent, manual_units, related_units, activity_id')
        .eq('budget_id', budgetId)
        .order('name', { ascending: true });

      if (error) throw error;
      setExistingResources((data || []) as ExistingBudgetResource[]);
    } catch (err: any) {
      console.error('Error fetching existing resources:', err);
      toast.error(err.message || 'Error al cargar recursos existentes');
    } finally {
      setExistingResourcesLoading(false);
    }
  };

  // Handle new resource for current activity - open form directly
  const handleNewResource = () => {
    if (!editingActivity) return;

    // Preselect current activity in the resource form
    window.sessionStorage.setItem('preselectedActivityId', editingActivity.id);

    // Null resource = create mode (avoids updating with id = null)
    setEditingResourceForForm(null);
    setResourceFormOpen(true);
  };

  // Handle edit resource - open form dialog directly
  const handleEditResource = (resourceId: string) => {
    const resource = activityResources.find(r => r.id === resourceId);
    if (resource && editingActivity) {
      // Go directly to full edit form
      setEditingResourceForForm({
        id: resource.id,
        budget_id: editingActivity.budget_id,
        name: resource.name,
        external_unit_cost: resource.external_unit_cost,
        unit: resource.unit,
        resource_type: resource.resource_type,
        safety_margin_percent: resource.safety_margin_percent,
        sales_margin_percent: resource.sales_margin_percent,
        manual_units: resource.manual_units,
        related_units: resource.related_units,
        activity_id: editingActivity.id,
        description: null,
      });
      setResourceFormOpen(true);
    }
  };

  // Handle delete resource
  const handleDeleteResource = async (resourceId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este recurso?')) return;
    
    try {
      const { error } = await supabase
        .from('budget_activity_resources')
        .delete()
        .eq('id', resourceId);

      if (error) throw error;
      
      // Update local state
      setActivityResources(prev => prev.filter(r => r.id !== resourceId));
      toast.success('Recurso eliminado');
      
      // Refresh main data
      fetchData();
    } catch (err: any) {
      console.error('Error deleting resource:', err);
      toast.error(err.message || 'Error al eliminar recurso');
    }
  };

  // Open duplicate resource dialog
  const openDuplicateResourceDialog = (resource: ActivityResource) => {
    setDuplicatingResource(resource);
    setDuplicateResourceName(`${resource.name} (copia)`);
    setDuplicateResourceDialogOpen(true);
  };

  // Handle duplicate resource
  const handleDuplicateResource = async () => {
    if (!editingActivity || !duplicatingResource) return;
    
    const trimmedName = duplicateResourceName.trim();
    if (!trimmedName) {
      toast.error('El nombre del recurso es obligatorio');
      return;
    }
    
    // Check for duplicate name in current activity resources
    const isDuplicate = activityResources.some(
      r => r.name.toLowerCase() === trimmedName.toLowerCase() && r.id !== duplicatingResource.id
    );
    
    if (isDuplicate) {
      toast.error('Ya existe un recurso con ese nombre en esta actividad');
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('budget_activity_resources')
        .insert({
          budget_id: editingActivity.budget_id,
          activity_id: editingActivity.id,
          name: trimmedName,
          external_unit_cost: duplicatingResource.external_unit_cost,
          unit: duplicatingResource.unit,
          resource_type: duplicatingResource.resource_type,
          safety_margin_percent: duplicatingResource.safety_margin_percent,
          sales_margin_percent: duplicatingResource.sales_margin_percent,
          manual_units: duplicatingResource.manual_units,
          related_units: duplicatingResource.related_units,
        })
        .select()
        .single();

      if (error) throw error;
      
      // Add to local state
      if (data) {
        const newResource: ActivityResource = {
          id: data.id,
          name: data.name,
          external_unit_cost: data.external_unit_cost,
          unit: data.unit,
          resource_type: data.resource_type,
          safety_margin_percent: data.safety_margin_percent,
          sales_margin_percent: data.sales_margin_percent,
          manual_units: data.manual_units,
          related_units: data.related_units,
        };
        setActivityResources(prev => [...prev, newResource].sort((a, b) => a.name.localeCompare(b.name)));
      }
      
      setDuplicateResourceDialogOpen(false);
      setDuplicatingResource(null);
      toast.success('Recurso duplicado');
      fetchData();
    } catch (err: any) {
      console.error('Error duplicating resource:', err);
      toast.error(err.message || 'Error al duplicar recurso');
    }
  };

  // Open delete confirmation
  const handleDeleteClick = (activity: BudgetActivity) => {
    setDeletingActivity(activity);
    setDeleteDialogOpen(true);
  };

  // Save activity
  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    if (!form.code.trim()) {
      toast.error('El código es obligatorio');
      return;
    }

    setIsSaving(true);

    try {
      const data = {
        budget_id: budgetId,
        name: form.name.trim(),
        code: form.code.trim(),
        description: form.description.trim() || null,
        measurement_unit: form.measurement_unit,
        phase_id: form.phase_id && form.phase_id !== '' && form.phase_id !== 'null' ? form.phase_id : null,
        measurement_id: form.measurement_id && form.measurement_id !== '' && form.measurement_id !== 'null' ? form.measurement_id : null,
        uses_measurement: form.uses_measurement,
        opciones: form.opciones.length > 0 ? form.opciones : ['A', 'B', 'C'],
        start_date: form.start_date || null,
        duration_days: form.duration_days ? parseInt(form.duration_days) : null,
        tolerance_days: form.tolerance_days ? parseInt(form.tolerance_days) : null,
        actual_start_date: form.actual_start_date || null,
        actual_end_date: form.actual_end_date || null,
      };

      let savedActivityId: string | null = null;

      if (editingActivity) {
        const { error } = await supabase
          .from('budget_activities')
          .update(data)
          .eq('id', editingActivity.id);

        if (error) throw error;
        savedActivityId = editingActivity.id;
        toast.success('Actividad actualizada');
      } else {
        const { data: newActivity, error } = await supabase
          .from('budget_activities')
          .insert(data)
          .select('id')
          .single();

        if (error) throw error;
        savedActivityId = newActivity?.id || null;
        toast.success('Actividad creada');
      }

       // Sync related_units for the activity's resources
      if (savedActivityId) {
        await syncActivityResourcesRelatedUnits(savedActivityId);
        
        // Update work area relations
        const normalizedWorkAreaIds = normalizeIds(form.work_area_ids);

        // First, delete existing relations for this activity
        const { error: deleteRelError } = await supabase
          .from('budget_work_area_activities')
          .delete()
          .eq('activity_id', savedActivityId);

        if (deleteRelError) throw deleteRelError;

        // Insert new relations (idempotent; avoid unique violations)
        if (normalizedWorkAreaIds.length > 0) {
          // CRITICAL: Use the correct column order matching the unique constraint (work_area_id, activity_id)
          const relationsToInsert = normalizedWorkAreaIds.map((workAreaId) => ({
            work_area_id: workAreaId,
            activity_id: savedActivityId,
          }));

          const { error: relError } = await supabase
            .from('budget_work_area_activities')
            .upsert(relationsToInsert, {
              onConflict: 'work_area_id,activity_id',
              ignoreDuplicates: true,
            });

          if (relError) throw relError;
        }
      }

      setFormDialogOpen(false);
      
      // If we have a return tab, dispatch event to navigate back
      if (returnTabAfterSave) {
        window.dispatchEvent(new CustomEvent('activity-form-closed', { 
          detail: { returnTab: returnTabAfterSave } 
        }));
        setReturnTabAfterSave(null);
      }
      
      // Immediate refetch for local state
      await fetchData();
      // Broadcast to other clients for instant sync
      broadcastActivityChange(editingActivity ? 'update' : 'create', savedActivityId || undefined);
    } catch (err: any) {
      console.error('Error saving:', err);
      toast.error(err.message || 'Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete activity
  const handleDelete = async () => {
    if (!deletingActivity) return;

    try {
      const { error } = await supabase
        .from('budget_activities')
        .delete()
        .eq('id', deletingActivity.id);

      if (error) throw error;
      const deletedId = deletingActivity.id;
      toast.success('Actividad eliminada');
      setDeleteDialogOpen(false);
      setDeletingActivity(null);
      await fetchData();
      broadcastActivityChange('delete', deletedId);
    } catch (err: any) {
      console.error('Error deleting:', err);
      toast.error(err.message || 'Error al eliminar');
    }
  };

  // Duplicate activity with all related files and resources
  const handleDuplicate = async (activity: BudgetActivity) => {
    try {
      // Create duplicated activity - including measurement_id and uses_measurement
      const { data: newActivity, error: activityError } = await supabase
        .from('budget_activities')
        .insert({
          budget_id: budgetId,
          name: `${activity.name} (copia)`,
          code: `${activity.code}-C`,
          description: activity.description,
          measurement_unit: activity.measurement_unit,
          measurement_id: activity.measurement_id, // Keep measurement relation
          uses_measurement: activity.uses_measurement, // Keep uses_measurement flag
          phase_id: activity.phase_id,
          start_date: activity.start_date,
          duration_days: activity.duration_days,
          tolerance_days: activity.tolerance_days
        })
        .select()
        .single();

      if (activityError) throw activityError;

      // Get resources from original activity
      const { data: originalResources, error: resourcesError } = await supabase
        .from('budget_activity_resources')
        .select('*')
        .eq('activity_id', activity.id);

      if (resourcesError) throw resourcesError;

      // Duplicate resources if any
      if (originalResources && originalResources.length > 0) {
        const resourcesToInsert = originalResources.map(resource => ({
          budget_id: budgetId,
          activity_id: newActivity.id,
          name: `${resource.name} (copia)`,
          description: resource.description,
          resource_type: resource.resource_type,
          unit: resource.unit,
          manual_units: resource.manual_units,
          related_units: resource.related_units,
          external_unit_cost: resource.external_unit_cost,
          safety_margin_percent: resource.safety_margin_percent,
          sales_margin_percent: resource.sales_margin_percent
        }));

        const { error: insertResourcesError } = await supabase
          .from('budget_activity_resources')
          .insert(resourcesToInsert);

        if (insertResourcesError) {
          console.error('Error duplicating resources:', insertResourcesError);
        }
      }

      // Get files from original activity
      const { data: files, error: filesError } = await supabase
        .from('budget_activity_files')
        .select('*')
        .eq('activity_id', activity.id);

      if (filesError) throw filesError;

      // Duplicate files if any
      if (files && files.length > 0) {
        for (const file of files) {
          // Download original file
          const { data: fileData, error: downloadError } = await supabase.storage
            .from('activity-files')
            .download(file.file_path);

          if (downloadError) {
            console.error('Error downloading file:', downloadError);
            continue;
          }

          // Upload with new path
          const fileExt = file.file_name.split('.').pop();
          const newPath = `${newActivity.id}/${Date.now()}.${fileExt}`;
          
          const { error: uploadError } = await supabase.storage
            .from('activity-files')
            .upload(newPath, fileData);

          if (uploadError) {
            console.error('Error uploading file:', uploadError);
            continue;
          }

          // Create file record
          await supabase
            .from('budget_activity_files')
            .insert({
              activity_id: newActivity.id,
              file_name: file.file_name,
              file_path: newPath,
              file_type: file.file_type,
              file_size: file.file_size
            });
        }
      }

      toast.success('Actividad duplicada con recursos');
      fetchData();
    } catch (err: any) {
      console.error('Error duplicating:', err);
      toast.error(err.message || 'Error al duplicar');
    }
  };

  // Import CSV
  const handleImport = async () => {
    if (!importFile) {
      toast.error('Selecciona un archivo');
      return;
    }

    setIsImporting(true);

    try {
      const text = await importFile.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      // Skip header
      const dataLines = lines.slice(1);
      
      const activitiesToInsert = dataLines.map(line => {
        // Parse CSV line (handle quoted values)
        const values: string[] = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        values.push(current.trim());

        return {
          budget_id: budgetId,
          name: values[0] || '',
          code: values[1] || '',
          description: null,
          measurement_unit: 'ud'
        };
      }).filter(a => a.name && a.code);

      if (activitiesToInsert.length === 0) {
        toast.error('No se encontraron actividades válidas en el archivo');
        return;
      }

      const { error } = await supabase
        .from('budget_activities')
        .insert(activitiesToInsert);

      if (error) throw error;

      toast.success(`${activitiesToInsert.length} actividades importadas`);
      setImportDialogOpen(false);
      setImportFile(null);
      fetchData();
    } catch (err: any) {
      console.error('Error importing:', err);
      toast.error(err.message || 'Error al importar');
    } finally {
      setIsImporting(false);
    }
  };

  // Toggle phase expansion
  const togglePhaseExpanded = (phaseId: string) => {
    setExpandedPhases(prev => {
      const newSet = new Set(prev);
      if (newSet.has(phaseId)) {
        newSet.delete(phaseId);
      } else {
        newSet.add(phaseId);
      }
      return newSet;
    });
  };

  // Generate ActividadID
  const generateActivityId = (activity: BudgetActivity) => {
    const phase = phases.find(p => p.id === activity.phase_id);
    const phaseCode = phase?.code || '';
    return `${phaseCode} ${activity.code}.- ${activity.name}`.trim();
  };

  // Sort activities by ActividadID
  const sortActivitiesByActivityId = (activitiesToSort: BudgetActivity[]) => {
    return [...activitiesToSort].sort((a, b) => {
      const actIdA = generateActivityId(a);
      const actIdB = generateActivityId(b);
      return activitySortOrder === 'asc' 
        ? actIdA.localeCompare(actIdB) 
        : actIdB.localeCompare(actIdA);
    });
  };

  // Toggle sort order
  const toggleActivitySortOrder = () => {
    setActivitySortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  // Get phase by id
  const getPhaseById = (phaseId: string | null) => {
    return phases.find(p => p.id === phaseId);
  };

  // Get measurement data for an activity
  const getMeasurementData = (activity: BudgetActivity): { measurement: Measurement | null; relatedUnits: number; medicionId: string } => {
    // If uses_measurement is explicitly false, return 0 for related units
    if (activity.uses_measurement === false) {
      const measurement = activity.measurement_id ? measurements.find(m => m.id === activity.measurement_id) : null;
      return {
        measurement,
        relatedUnits: 0,
        medicionId: measurement ? `0,00/${measurement.measurement_unit || 'ud'}: ${measurement.name}` : '-'
      };
    }
    
    if (!activity.measurement_id) {
      return { measurement: null, relatedUnits: 0, medicionId: '-' };
    }
    
    const measurement = measurements.find(m => m.id === activity.measurement_id);
    if (!measurement) {
      return { measurement: null, relatedUnits: 0, medicionId: '-' };
    }
    
    // Calculate related units (sum of manual_units from related measurements)
    const relatedMeasurementIds = measurementRelations
      .filter(r => r.measurement_id === measurement.id)
      .map(r => r.related_measurement_id);
    
    const relatedUnitsSum = relatedMeasurementIds.reduce((sum, relId) => {
      const relMeasurement = measurements.find(m => m.id === relId);
      return sum + (relMeasurement?.manual_units || 0);
    }, 0);
    
    // Uds cálculo: if relatedUnits > 0 use that, else use manual_units
    const udsCalculo = relatedUnitsSum > 0 ? relatedUnitsSum : (measurement.manual_units || 0);
    
    // Generate MediciónID: Uds cálculo/Ud medida: Measurement name
    const medicionId = `${formatNumber(udsCalculo)}/${measurement.measurement_unit || 'ud'}: ${measurement.name}`;
    
    return { 
      measurement, 
      relatedUnits: udsCalculo, 
      medicionId 
    };
  };

  // Update activity measurement_id inline
  const handleUpdateActivityMeasurement = async (activityId: string, measurementId: string | null) => {
    try {
      const { error } = await supabase
        .from('budget_activities')
        .update({ measurement_id: measurementId })
        .eq('id', activityId);

      if (error) throw error;
      
      // Sync related_units for the activity's resources
      await syncActivityResourcesRelatedUnits(activityId);
      
      // Update local state
      setActivities(prev => prev.map(a => 
        a.id === activityId ? { ...a, measurement_id: measurementId } : a
      ));
      toast.success('Medición actualizada');
    } catch (err: any) {
      console.error('Error updating measurement:', err);
      toast.error(err.message || 'Error al actualizar medición');
    }
  };

  // Update activity work areas
  const handleUpdateActivityWorkAreas = async (activityId: string, workAreaIds: string[]) => {
    return enqueueWorkAreaUpdate(activityId, async () => {
      const normalizedIds = normalizeIds(workAreaIds);

      try {
        // Always compute diff from the DB to avoid stale local state (fast toggles + realtime)
        const { data: currentRows, error: currentError } = await supabase
          .from('budget_work_area_activities')
          .select('work_area_id')
          .eq('activity_id', activityId);

        if (currentError) throw currentError;

        const currentWorkAreaIds = new Set((currentRows || []).map((r) => r.work_area_id));
        const newWorkAreaIds = new Set(normalizedIds);
        const toAdd = normalizedIds.filter((id) => !currentWorkAreaIds.has(id));
        const toRemove = [...currentWorkAreaIds].filter((id) => !newWorkAreaIds.has(id));

        if (toRemove.length > 0) {
          const { error: removeError } = await supabase
            .from('budget_work_area_activities')
            .delete()
            .eq('activity_id', activityId)
            .in('work_area_id', toRemove);

          if (removeError) throw removeError;
        }

        if (toAdd.length > 0) {
          // Idempotent insert: avoid unique constraint errors under concurrent updates.
          // CRITICAL: Use the correct column order matching the unique constraint (work_area_id, activity_id)
          const { error: addError } = await supabase
            .from('budget_work_area_activities')
            .upsert(toAdd.map((wid) => ({ work_area_id: wid, activity_id: activityId })), {
              onConflict: 'work_area_id,activity_id',
              ignoreDuplicates: true,
            });

          if (addError) throw addError;
        }

        // Update local state optimistically
        setWorkAreaRelations((prev) => {
          const filtered = prev.filter((r) => r.activity_id !== activityId);
          return [
            ...filtered,
            ...normalizedIds.map((wid) => ({ activity_id: activityId, work_area_id: wid })),
          ];
        });
      } catch (err: any) {
        console.error('Error updating work areas:', err);
        const msg = err?.message || 'Error desconocido';
        const details = err?.details ? ` (${err.details})` : '';
        toast.error('Error al actualizar áreas: ' + msg + details);
        // Refetch to restore correct state
        fetchData();
      }
    });
  };

  // Navigate to previous/next activity in form
  const navigateToActivity = async (direction: 'prev' | 'next') => {
    if (!editingActivity) return;
    
    const sortedActivities = [...activities].sort((a, b) => a.name.localeCompare(b.name));
    const currentIndex = sortedActivities.findIndex(a => a.id === editingActivity.id);
    
    let newIndex: number;
    if (direction === 'prev') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : sortedActivities.length - 1;
    } else {
      newIndex = currentIndex < sortedActivities.length - 1 ? currentIndex + 1 : 0;
    }
    
    const newActivity = sortedActivities[newIndex];
    if (newActivity) {
      await handleEdit(newActivity);
    }
  };

  // Manage activity files
  const handleManageFiles = async (activity: BudgetActivity) => {
    setSelectedActivity(activity);
    
    const { data, error } = await supabase
      .from('budget_activity_files')
      .select('*')
      .eq('activity_id', activity.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching files:', error);
      toast.error('Error al cargar archivos');
      return;
    }

    setActivityFiles(data || []);
    setFilesDialogOpen(true);
  };

  // Upload file to activity
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !selectedActivity) return;

    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${selectedActivity.id}/${Date.now()}.${fileExt}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from('activity-files')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('budget_activity_files')
        .insert({
          activity_id: selectedActivity.id,
          file_name: file.name,
          file_path: fileName,
          file_type: file.type,
          file_size: file.size
        });

      if (dbError) throw dbError;

      toast.success('Archivo subido');
      handleManageFiles(selectedActivity);
      fetchData();
    } catch (err: any) {
      console.error('Error uploading:', err);
      toast.error(err.message || 'Error al subir archivo');
    }

    if (activityFileInputRef.current) {
      activityFileInputRef.current.value = '';
    }
  };

  // Delete file
  const handleDeleteFile = async (file: ActivityFile) => {
    try {
      // Delete from storage
      await supabase.storage
        .from('activity-files')
        .remove([file.file_path]);

      // Delete from database
      const { error } = await supabase
        .from('budget_activity_files')
        .delete()
        .eq('id', file.id);

      if (error) throw error;

      toast.success('Archivo eliminado');
      if (selectedActivity) {
        handleManageFiles(selectedActivity);
      }
      fetchData();
    } catch (err: any) {
      console.error('Error deleting file:', err);
      toast.error(err.message || 'Error al eliminar archivo');
    }
  };

  // Download file
  const handleDownloadFile = async (file: ActivityFile) => {
    try {
      const { data, error } = await supabase.storage
        .from('activity-files')
        .download(file.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Error downloading:', err);
      toast.error(err.message || 'Error al descargar');
    }
  };

  // Filter activities based on search and granular permissions
  const filteredActivities = useMemo(() => {
    let filtered = activities.filter(a => {
      return (
        searchMatch(a.name, searchTerm) ||
        searchMatch(a.code, searchTerm) ||
        searchMatch(a.description, searchTerm) ||
        searchMatch(a.measurement_unit, searchTerm)
      );
    });

    // Apply granular permissions filter for non-admin users with granular access
    if (!permissions.isAdmin && permissions.hasGranularAccess) {
      filtered = filtered.filter(activity => 
        canAccessActivity(permissions, activity.id, 'view')
      );
    }

    return filtered;
  }, [activities, searchTerm, permissions]);

  // Check if user can edit a specific activity
  const canEditActivity = useCallback((activityId: string): boolean => {
    if (permissions.isAdmin) return true;
    if (!permissions.canEdit) return false;
    
    // If user has granular access, check specific activity permissions
    if (permissions.hasGranularAccess) {
      return canAccessActivity(permissions, activityId, 'edit');
    }
    
    return permissions.canEdit;
  }, [permissions]);

  // Calculate total for PDF export
  const totalResourcesSubtotal = useMemo(() => {
    return activities.reduce((total, activity) => total + (activity.resources_subtotal || 0), 0);
  }, [activities]);

  // Export activities summary to PDF
  const exportActivitiesPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Company info from settings - only name, email, phone (no address per user request)
    const companyName = companySettings.name || 'Mi Empresa';
    const companyEmail = companySettings.email || '';
    const companyPhone = companySettings.phone || '';
    const companyInitials = companyName.substring(0, 2).toUpperCase();
    
    // Header with company branding
    doc.setFillColor(37, 99, 235);
    doc.roundedRect(14, 10, 25, 25, 3, 3, 'F');
    doc.setTextColor(255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(companyInitials, 26.5, 26, { align: 'center' });
    doc.setTextColor(0);
    
    // Company name and contact (only email and phone, no address)
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 99, 235);
    doc.text(companyName, 45, 18);
    doc.setTextColor(0);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    const contactLine = [companyEmail, companyPhone].filter(Boolean).join('; ');
    if (contactLine) doc.text(contactLine, 45, 26);
    doc.setTextColor(0);
    
    // Separator line
    doc.setDrawColor(200);
    doc.line(14, 40, pageWidth - 14, 40);
    
    // Document title
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMEN DE ACTIVIDADES POR FASE', pageWidth / 2, 50, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(budgetName, pageWidth / 2, 58, { align: 'center' });
    
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Fecha de generación: ${format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es })}`, pageWidth / 2, 65, { align: 'center' });
    doc.setTextColor(0);

    // Summary section
    let yPos = 80;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 99, 235);
    doc.text('Resumen General', 14, yPos);
    doc.setTextColor(0);
    
    yPos += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    const summaryData = [
      ['Total de actividades:', activities.length.toString()],
      ['Total de fases:', phases.length.toString()],
    ];
    
    summaryData.forEach(([label, value]) => {
      doc.text(label, 14, yPos);
      doc.text(value, 80, yPos);
      yPos += 6;
    });
    
    // Total highlighted
    yPos += 4;
    doc.setFillColor(34, 197, 94);
    doc.roundedRect(14, yPos - 4, pageWidth - 28, 10, 2, 2, 'F');
    doc.setTextColor(255);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL €SubTotal Recursos:', 18, yPos + 3);
    doc.text(formatPdfCurrency(totalResourcesSubtotal), pageWidth - 18, yPos + 3, { align: 'right' });
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');

    // Activities grouped by phase table
    yPos += 20;
    
    // Build table data grouped by phase
    const tableData: any[] = [];
    
    // First add unassigned activities
    const unassigned = activities.filter(a => !a.phase_id);
    if (unassigned.length > 0) {
      const unassignedSubtotal = unassigned.reduce((sum, a) => sum + (a.resources_subtotal || 0), 0);
      tableData.push([
        { content: 'Sin fase asignada', colSpan: 3, styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } },
        { content: formatPdfCurrency(unassignedSubtotal), styles: { fillColor: [240, 240, 240], fontStyle: 'bold', halign: 'right' } }
      ]);
      unassigned.forEach(activity => {
        tableData.push([
          `  ${generateActivityId(activity)}`,
          activity.measurement_unit,
          activity.files_count?.toString() || '0',
          formatPdfCurrency(activity.resources_subtotal || 0)
        ]);
      });
    }
    
    // Then add phases with their activities
    phases.forEach(phase => {
      const phaseActivities = activities.filter(a => a.phase_id === phase.id);
      if (phaseActivities.length === 0) return;
      
      const phaseSubtotal = phaseActivities.reduce((sum, a) => sum + (a.resources_subtotal || 0), 0);
      
      // Phase header row
      tableData.push([
        { content: `${phase.code || ''} ${phase.name}`, colSpan: 3, styles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: formatPdfCurrency(phaseSubtotal), styles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } }
      ]);
      
      // Activity rows
      phaseActivities.sort((a, b) => a.name.localeCompare(b.name)).forEach(activity => {
        tableData.push([
          `  ${generateActivityId(activity)}`,
          activity.measurement_unit,
          activity.files_count?.toString() || '0',
          formatPdfCurrency(activity.resources_subtotal || 0)
        ]);
      });
    });
    
    // Total row
    tableData.push([
      { content: 'TOTAL PRESUPUESTO', colSpan: 3, styles: { fillColor: [34, 197, 94], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } },
      { content: formatPdfCurrency(totalResourcesSubtotal), styles: { fillColor: [34, 197, 94], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } }
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['ActividadID', 'Unidad', 'Archivos', '€SubTotal Recursos']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 14, right: 14 },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 90 },
        1: { cellWidth: 20 },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 40, halign: 'right' },
      },
    });

    // Footer with company info
    const pageCount = doc.getNumberOfPages();
    const pageHeight = doc.internal.pageSize.getHeight();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      
      doc.setDrawColor(200);
      doc.line(14, pageHeight - 20, pageWidth - 14, pageHeight - 20);
      
      doc.setFontSize(7);
      doc.setTextColor(120);
      const footerInfo = [companyName, companyEmail, companyPhone].filter(Boolean).join(' | ');
      doc.text(footerInfo, 14, pageHeight - 14);
      
      doc.text(
        `Página ${i} de ${pageCount}`,
        pageWidth - 14,
        pageHeight - 14,
        { align: 'right' }
      );
    }

    // Save
    const fileName = `actividades_${budgetName.replace(/[^a-zA-Z0-9]/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`;
    doc.save(fileName);
    toast.success('PDF exportado correctamente');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">QUÉ hay que hacer? - Actividades</h3>
          <p className="text-sm text-muted-foreground">{activities.length} actividad(es)</p>
        </div>
        <div className="flex gap-2">
          {/* View Mode Toggle */}
          <div className="flex border rounded-lg">
            <Button 
              variant={viewMode === 'alphabetical' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => setViewMode('alphabetical')}
              className="rounded-r-none"
            >
              <List className="h-4 w-4 mr-1" />
              Alfabético
            </Button>
            <Button 
              variant={viewMode === 'grouped' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => setViewMode('grouped')}
              className="rounded-none border-l"
            >
              <Layers className="h-4 w-4 mr-1" />
              Por Fase
            </Button>
            <Button 
              variant={viewMode === 'workarea' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => setViewMode('workarea')}
              className="rounded-none border-l"
            >
              <MapPin className="h-4 w-4 mr-1" />
              Por Área
            </Button>
            <Button 
              variant={viewMode === 'time' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => setViewMode('time')}
              className="rounded-none border-l"
            >
              <Clock className="h-4 w-4 mr-1" />
              Tiempo
            </Button>
            <Button 
              variant={viewMode === 'options' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => setViewMode('options')}
              className="rounded-l-none border-l"
            >
              <Settings2 className="h-4 w-4 mr-1" />
              Por Opción
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={exportActivitiesPDF}>
            <FileDown className="h-4 w-4 mr-1" />
            Exportar PDF
          </Button>
          {isAdmin && (
            <>
              <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Importar CSV
              </Button>
              <Button onClick={handleNew}>
                <Plus className="h-4 w-4 mr-2" />
                Nueva Actividad
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, código, descripción..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Budget Total Summary with Option Subtotals */}
      {(() => {
        const OPCIONES = ['A', 'B', 'C'];
        const subtotalsByOption: Record<string, number> = { A: 0, B: 0, C: 0 };

        activities.forEach(activity => {
          const opciones = activity.opciones?.length ? activity.opciones : ['A', 'B', 'C'];
          opciones.forEach(op => {
            if (subtotalsByOption[op] !== undefined) {
              subtotalsByOption[op] += (activity.resources_subtotal || 0);
            }
          });
        });

        // Resources without activity apply to all options
        (['A', 'B', 'C'] as const).forEach(op => {
          subtotalsByOption[op] += unassignedResourcesSubtotal;
        });

        return (
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm text-muted-foreground">Total Presupuesto Recursos</p>
                <p className="text-xs text-muted-foreground">{activities.length} actividades</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {OPCIONES.map(op => {
                const colors = OPTION_COLORS[op];
                return (
                  <div key={op} className={`rounded-lg p-3 border ${colors?.bgLight || ''} ${colors?.bgLightDark || ''} ${colors?.border || ''}`}>
                    <div className="flex items-center justify-between">
                      <Badge
                        variant="default"
                        className={`text-sm px-2 ${colors?.bg || ''} ${colors?.hover || ''}`}
                      >
                        Opción {op}
                      </Badge>
                      <p className={`text-lg font-bold font-mono ${colors?.text || ''} ${colors?.textDark || ''}`}>
                        {formatCurrency(subtotalsByOption[op])}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {unassignedResourcesSubtotal > 0 && (
              <div className="mt-3 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
                Incluye <strong>{formatCurrency(unassignedResourcesSubtotal)}</strong> en recursos sin actividad asignada.
              </div>
            )}
          </div>
        );
      })()}

      {/* Bulk Edit Bar for Activities */}
      <ActivitiesBulkEditBar
        selectedIds={selectedActivityIds}
        activities={activities.map(a => ({
          id: a.id,
          name: a.name,
          code: a.code,
          uses_measurement: a.uses_measurement,
          opciones: a.opciones || ['A', 'B', 'C'],
          phase_id: a.phase_id,
        }))}
        phases={phases}
        onClearSelection={() => setSelectedActivityIds(new Set())}
        onRefresh={fetchData}
        onBulkDelete={async () => {
          if (!confirm(`¿Eliminar ${selectedActivityIds.size} actividades?`)) return;
          try {
            const { error } = await supabase
              .from('budget_activities')
              .delete()
              .in('id', Array.from(selectedActivityIds));
            if (error) throw error;
            toast.success(`${selectedActivityIds.size} actividades eliminadas`);
            setSelectedActivityIds(new Set());
            fetchData();
          } catch (err: any) {
            toast.error('Error al eliminar');
          }
        }}
        isAdmin={isAdmin}
      />

      {/* Alphabetical View */}
      {viewMode === 'alphabetical' && (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={filteredActivities.length > 0 && filteredActivities.every(a => selectedActivityIds.has(a.id))}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedActivityIds(new Set(filteredActivities.map(a => a.id)));
                      } else {
                        setSelectedActivityIds(new Set());
                      }
                    }}
                  />
                </TableHead>
                <TableHead>ActividadID</TableHead>
                <TableHead className="text-center w-16">Usa Med.</TableHead>
                <TableHead>Actividad</TableHead>
                <TableHead>Áreas</TableHead>
                <TableHead>Opciones</TableHead>
                <TableHead>Fase</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead className="text-right">Uds Relac.</TableHead>
                <TableHead>MediciónID</TableHead>
                <TableHead className="text-right">€SubTotal Recursos</TableHead>
                <TableHead>Archivos</TableHead>
                {(isAdmin || permissions.canEdit) && <TableHead className="w-20">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredActivities.map((activity) => {
                const phase = getPhaseById(activity.phase_id);
                const { relatedUnits, medicionId } = getMeasurementData(activity);
                const opciones = activity.opciones || ['A', 'B', 'C'];
                return (
                  <TableRow key={activity.id} className={selectedActivityIds.has(activity.id) ? 'bg-primary/5' : ''}>
                    <TableCell>
                      <Checkbox
                        checked={selectedActivityIds.has(activity.id)}
                        onCheckedChange={() => {
                          const newSet = new Set(selectedActivityIds);
                          if (newSet.has(activity.id)) {
                            newSet.delete(activity.id);
                          } else {
                            newSet.add(activity.id);
                          }
                          setSelectedActivityIds(newSet);
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{generateActivityId(activity)}</TableCell>
                    <TableCell className="text-center">
                      {canEditActivity(activity.id) ? (
                        <button
                          onClick={async () => {
                            const newValue = !activity.uses_measurement;
                            try {
                              const { error } = await supabase
                                .from('budget_activities')
                                .update({ uses_measurement: newValue })
                                .eq('id', activity.id);
                              if (error) throw error;
                              await syncActivityResourcesRelatedUnits(activity.id);
                              fetchData();
                              toast.success(`Usa Medición: ${newValue ? 'Sí' : 'No'}`);
                            } catch (err: any) {
                              toast.error('Error al actualizar');
                            }
                          }}
                          className="cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          <Badge variant={activity.uses_measurement !== false ? 'default' : 'secondary'} className="text-xs">
                            {activity.uses_measurement !== false ? 'Sí' : 'No'}
                          </Badge>
                        </button>
                      ) : (
                        <Badge variant={activity.uses_measurement !== false ? 'default' : 'secondary'} className="text-xs">
                          {activity.uses_measurement !== false ? 'Sí' : 'No'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {canEditActivity(activity.id) ? (
                        <button
                          onClick={() => handleEdit(activity)}
                          className="text-left hover:text-primary hover:underline transition-colors cursor-pointer"
                        >
                          {activity.name}
                        </button>
                      ) : (
                        activity.name
                      )}
                    </TableCell>
                    <TableCell className="max-w-[180px]">
                      {canEditActivity(activity.id) ? (
                        <WorkAreaInlineSelect
                          activityId={activity.id}
                          workAreas={workAreas}
                          workAreaRelations={workAreaRelations}
                          onSave={(ids) => handleUpdateActivityWorkAreas(activity.id, ids)}
                        />
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          {workAreaRelations.filter(r => r.activity_id === activity.id).length} áreas
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {canEditActivity(activity.id) ? (
                        <div className="flex gap-0.5">
                          {['A', 'B', 'C'].map(op => {
                            const isSelected = opciones.includes(op);
                            return (
                              <button
                                key={op}
                                onClick={async () => {
                                  let newOpciones: string[];
                                  if (isSelected) {
                                    // Don't allow deselecting if it's the only one
                                    if (opciones.length === 1) {
                                      toast.error('Debe haber al menos una opción seleccionada');
                                      return;
                                    }
                                    newOpciones = opciones.filter(o => o !== op);
                                  } else {
                                    newOpciones = [...opciones, op].sort();
                                  }
                                  try {
                                    const { error } = await supabase
                                      .from('budget_activities')
                                      .update({ opciones: newOpciones })
                                      .eq('id', activity.id);
                                    if (error) throw error;
                                    fetchData();
                                    toast.success(`Opciones actualizadas`);
                                  } catch (err: any) {
                                    toast.error('Error al actualizar opciones');
                                  }
                                }}
                                className="cursor-pointer hover:opacity-80 transition-opacity"
                              >
                                <Badge 
                                  variant={isSelected ? "default" : "outline"}
                                  className={`text-xs px-1.5 ${
                                    op === 'A' 
                                      ? isSelected 
                                        ? 'bg-blue-500 hover:bg-blue-600 text-white' 
                                        : 'border-blue-500/40 text-blue-400 hover:border-blue-500 hover:text-blue-600'
                                      : op === 'B' 
                                        ? isSelected 
                                          ? 'bg-amber-500 hover:bg-amber-600 text-white' 
                                          : 'border-amber-500/40 text-amber-400 hover:border-amber-500 hover:text-amber-600'
                                        : isSelected 
                                          ? 'bg-emerald-500 hover:bg-emerald-600 text-white' 
                                          : 'border-emerald-500/40 text-emerald-400 hover:border-emerald-500 hover:text-emerald-600'
                                  }`}
                                >
                                  {op}
                                </Badge>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex gap-0.5">
                          {opciones.map(op => (
                            <Badge 
                              key={op} 
                              variant="outline" 
                              className={`text-xs px-1.5 ${
                                op === 'A' ? 'border-blue-500 text-blue-600' :
                                op === 'B' ? 'border-amber-500 text-amber-600' :
                                'border-emerald-500 text-emerald-600'
                              }`}
                            >
                              {op}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {phase ? `${phase.code} ${phase.name}` : '-'}
                    </TableCell>
                    <TableCell>{activity.measurement_unit}</TableCell>
                    <TableCell className="text-right">
                      {activity.measurement_id ? formatNumber(relatedUnits) : '-'}
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px]">
                      {canEditActivity(activity.id) ? (
                        <MeasurementInlineSelect
                          ref={(el) => registerCellRef(activity.id, el)}
                          activityId={activity.id}
                          value={activity.measurement_id}
                          measurements={measurements}
                          measurementRelations={measurementRelations}
                          onSave={(measurementId) => handleUpdateActivityMeasurement(activity.id, measurementId)}
                          onTabNext={() => navigateToMeasurementField(activity.id, 'next')}
                          onTabPrev={() => navigateToMeasurementField(activity.id, 'prev')}
                          onArrowUp={() => navigateToRow(activity.id, 'up')}
                          onArrowDown={() => navigateToRow(activity.id, 'down')}
                        />
                      ) : (
                        <span className="text-muted-foreground truncate" title={medicionId}>
                          {medicionId}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-primary">
                      {formatCurrency(activity.resources_subtotal || 0)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleManageFiles(activity)}
                        className="flex items-center gap-1"
                      >
                        <File className="h-4 w-4" />
                        {activity.files_count || 0}
                      </Button>
                    </TableCell>
                    {canEditActivity(activity.id) && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(activity)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            {isAdmin && (
                              <>
                                <DropdownMenuItem onClick={() => handleDuplicate(activity)}>
                                  <Copy className="h-4 w-4 mr-2" />
                                  Duplicar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleManageFiles(activity)}>
                                  <FileUp className="h-4 w-4 mr-2" />
                                  Archivos
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleDeleteClick(activity)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Eliminar
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {filteredActivities.length === 0 && (
                <TableRow>
                  <TableCell colSpan={(isAdmin || permissions.canEdit) ? 13 : 12} className="text-center py-8 text-muted-foreground">
                    {searchTerm 
                      ? 'No se encontraron actividades con ese criterio'
                      : 'No hay actividades. Crea una nueva o importa desde CSV.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Options Grouped View */}
      {viewMode === 'options' && (
        <ActivitiesOptionsGroupedView
          activities={filteredActivities.map(a => ({
            id: a.id,
            name: a.name,
            code: a.code,
            uses_measurement: a.uses_measurement,
            opciones: a.opciones || ['A', 'B', 'C'],
            phase_id: a.phase_id,
            resources_subtotal: a.resources_subtotal,
            files_count: a.files_count,
          }))}
          phases={phases}
          isAdmin={isAdmin}
          canEdit={permissions.canEdit}
          selectedIds={selectedActivityIds}
          expandedOptions={expandedOptions}
          extraSubtotalAllOptions={unassignedResourcesSubtotal}
          onToggleExpanded={(option) => {
            setExpandedOptions(prev => {
              const newSet = new Set(prev);
              if (newSet.has(option)) {
                newSet.delete(option);
              } else {
                newSet.add(option);
              }
              return newSet;
            });
          }}
          onToggleSelected={(id) => {
            setSelectedActivityIds(prev => {
              const newSet = new Set(prev);
              if (newSet.has(id)) {
                newSet.delete(id);
              } else {
                newSet.add(id);
              }
              return newSet;
            });
          }}
          onSelectAll={() => {
            if (filteredActivities.every(a => selectedActivityIds.has(a.id))) {
              setSelectedActivityIds(new Set());
            } else {
              setSelectedActivityIds(new Set(filteredActivities.map(a => a.id)));
            }
          }}
          onEdit={(activity) => {
            const fullActivity = activities.find(a => a.id === activity.id);
            if (fullActivity) handleEdit(fullActivity);
          }}
          onDelete={(activity) => {
            const fullActivity = activities.find(a => a.id === activity.id);
            if (fullActivity) handleDeleteClick(fullActivity);
          }}
          onDuplicate={(activity) => {
            const fullActivity = activities.find(a => a.id === activity.id);
            if (fullActivity) handleDuplicate(fullActivity);
          }}
          onManageFiles={(activity) => {
            const fullActivity = activities.find(a => a.id === activity.id);
            if (fullActivity) handleManageFiles(fullActivity);
          }}
          canEditActivity={canEditActivity}
          onUpdateOpciones={async (activityId, newOpciones) => {
            try {
              const { error } = await supabase
                .from('budget_activities')
                .update({ opciones: newOpciones })
                .eq('id', activityId);
              if (error) throw error;
              fetchData();
              toast.success('Opciones actualizadas');
            } catch (err: any) {
              toast.error('Error al actualizar opciones');
            }
          }}
        />
      )}

      {/* Grouped by Phase View */}
      {viewMode === 'grouped' && (
        <div className="space-y-2">
          {/* Activities without phase */}
          {(() => {
            const unassigned = filteredActivities.filter(a => !a.phase_id);
            if (unassigned.length > 0) {
              const isExpanded = expandedPhases.has('unassigned');
              return (
                <Collapsible open={isExpanded} onOpenChange={() => togglePhaseExpanded('unassigned')}>
                  <div className="border rounded-lg">
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div>
                            <p className="font-medium text-muted-foreground">Sin fase asignada</p>
                            <p className="text-sm text-muted-foreground">
                              {unassigned.length} actividad{unassigned.length !== 1 ? 'es' : ''}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t bg-muted/20 p-4">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-auto p-0 font-medium hover:bg-transparent"
                                  onClick={toggleActivitySortOrder}
                                >
                                  ActividadID
                                  {activitySortOrder === 'asc' ? (
                                    <ArrowUp className="ml-1 h-3 w-3 inline" />
                                  ) : (
                                    <ArrowDown className="ml-1 h-3 w-3 inline" />
                                  )}
                                </Button>
                              </TableHead>
                              <TableHead>Opciones</TableHead>
                              <TableHead>Unidad</TableHead>
                              <TableHead className="text-right">Uds Relac.</TableHead>
                              <TableHead>MediciónID</TableHead>
                              <TableHead className="text-right">€SubTotal Recursos</TableHead>
                              <TableHead>Archivos</TableHead>
                              {(isAdmin || permissions.canEdit) && <TableHead className="w-20">Acciones</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortActivitiesByActivityId(unassigned).map(activity => {
                              const { relatedUnits, medicionId } = getMeasurementData(activity);
                              const opciones = activity.opciones || ['A', 'B', 'C'];
                              return (
                                <TableRow key={activity.id}>
                                  <TableCell className="font-mono text-sm">{generateActivityId(activity)}</TableCell>
                                  <TableCell>
                                    {canEditActivity(activity.id) ? (
                                      <div className="flex gap-0.5">
                                        {['A', 'B', 'C'].map(op => {
                                          const isSelected = opciones.includes(op);
                                          return (
                                            <button
                                              key={op}
                                              onClick={async () => {
                                                let newOpciones: string[];
                                                if (isSelected) {
                                                  if (opciones.length === 1) {
                                                    toast.error('Debe haber al menos una opción seleccionada');
                                                    return;
                                                  }
                                                  newOpciones = opciones.filter(o => o !== op);
                                                } else {
                                                  newOpciones = [...opciones, op].sort();
                                                }
                                                try {
                                                  const { error } = await supabase
                                                    .from('budget_activities')
                                                    .update({ opciones: newOpciones })
                                                    .eq('id', activity.id);
                                                  if (error) throw error;
                                                  fetchData();
                                                  toast.success(`Opciones actualizadas`);
                                                } catch (err: any) {
                                                  toast.error('Error al actualizar opciones');
                                                }
                                              }}
                                              className="cursor-pointer hover:opacity-80 transition-opacity"
                                            >
                                              <Badge 
                                                variant={isSelected ? "default" : "outline"}
                                                className={`text-xs px-1.5 ${
                                                  isSelected 
                                                    ? `${OPTION_COLORS[op]?.bg || ''} ${OPTION_COLORS[op]?.hover || ''} text-white` 
                                                    : `${OPTION_COLORS[op]?.borderSolid || ''}/40 ${OPTION_COLORS[op]?.text || ''} opacity-60 hover:opacity-100`
                                                }`}
                                              >
                                                {op}
                                              </Badge>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <div className="flex gap-0.5">
                                        {opciones.map(op => (
                                          <Badge 
                                            key={op} 
                                            variant="outline" 
                                            className={`text-xs px-1.5 ${OPTION_COLORS[op]?.borderSolid || ''} ${OPTION_COLORS[op]?.text || ''}`}
                                          >
                                            {op}
                                          </Badge>
                                        ))}
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell>{activity.measurement_unit}</TableCell>
                                  <TableCell className="text-right">
                                    {activity.measurement_id ? formatNumber(relatedUnits) : '-'}
                                  </TableCell>
                                  <TableCell className="text-sm max-w-[150px]">
                                    {canEditActivity(activity.id) ? (
                                      <MeasurementInlineSelect
                                        ref={(el) => registerCellRef(activity.id, el)}
                                        activityId={activity.id}
                                        value={activity.measurement_id}
                                        measurements={measurements}
                                        measurementRelations={measurementRelations}
                                        onSave={(measurementId) => handleUpdateActivityMeasurement(activity.id, measurementId)}
                                        onTabNext={() => navigateToMeasurementField(activity.id, 'next')}
                                        onTabPrev={() => navigateToMeasurementField(activity.id, 'prev')}
                                        onArrowUp={() => navigateToRow(activity.id, 'up')}
                                        onArrowDown={() => navigateToRow(activity.id, 'down')}
                                      />
                                    ) : (
                                      <span className="text-muted-foreground truncate" title={medicionId}>
                                        {medicionId}
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right font-mono font-semibold text-primary">
                                    {formatCurrency(activity.resources_subtotal || 0)}
                                  </TableCell>
                                  <TableCell>
                                    <Button variant="ghost" size="sm" onClick={() => handleManageFiles(activity)}>
                                      <File className="h-4 w-4 mr-1" />{activity.files_count || 0}
                                    </Button>
                                  </TableCell>
                                  {canEditActivity(activity.id) && (
                                    <TableCell>
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuItem onClick={() => handleEdit(activity)}>
                                            <Pencil className="h-4 w-4 mr-2" />Editar
                                          </DropdownMenuItem>
                                          {isAdmin && (
                                            <>
                                              <DropdownMenuItem onClick={() => handleDuplicate(activity)}>
                                                <Copy className="h-4 w-4 mr-2" />Duplicar
                                              </DropdownMenuItem>
                                              <DropdownMenuItem onClick={() => handleDeleteClick(activity)} className="text-destructive">
                                                <Trash2 className="h-4 w-4 mr-2" />Eliminar
                                              </DropdownMenuItem>
                                            </>
                                          )}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </TableCell>
                                  )}
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            }
            return null;
          })()}

          {/* Activities grouped by phase */}
          {phases.map(phase => {
            const phaseActivities = filteredActivities.filter(a => a.phase_id === phase.id);
            if (phaseActivities.length === 0) return null;

            const isExpanded = expandedPhases.has(phase.id);
            
            // Calculate phase resources subtotal
            const phaseResourcesSubtotal = phaseActivities.reduce(
              (total, activity) => total + (activity.resources_subtotal || 0), 
              0
            );

            return (
              <Collapsible key={phase.id} open={isExpanded} onOpenChange={() => togglePhaseExpanded(phase.id)}>
                <div className="border rounded-lg">
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div>
                          <p className="font-medium">{phase.code} {phase.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {phaseActivities.length} actividad{phaseActivities.length !== 1 ? 'es' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">€SubTotal Recursos</p>
                        <p className="font-mono font-semibold text-primary">{formatCurrency(phaseResourcesSubtotal)}</p>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t bg-muted/20 p-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-auto p-0 font-medium hover:bg-transparent"
                                onClick={toggleActivitySortOrder}
                              >
                                ActividadID
                                {activitySortOrder === 'asc' ? (
                                  <ArrowUp className="ml-1 h-3 w-3 inline" />
                                ) : (
                                  <ArrowDown className="ml-1 h-3 w-3 inline" />
                                )}
                              </Button>
                            </TableHead>
                            <TableHead>Opciones</TableHead>
                            <TableHead>Unidad</TableHead>
                            <TableHead className="text-right">Uds Relac.</TableHead>
                            <TableHead>MediciónID</TableHead>
                            <TableHead className="text-right">€SubTotal Recursos</TableHead>
                            <TableHead>Archivos</TableHead>
                            {(isAdmin || permissions.canEdit) && <TableHead className="w-20">Acciones</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortActivitiesByActivityId(phaseActivities).map(activity => {
                            const { relatedUnits, medicionId } = getMeasurementData(activity);
                            const opciones = activity.opciones || ['A', 'B', 'C'];
                            return (
                              <TableRow key={activity.id}>
                                <TableCell className="font-mono text-sm">{generateActivityId(activity)}</TableCell>
                                <TableCell>
                                  {canEditActivity(activity.id) ? (
                                    <div className="flex gap-0.5">
                                      {['A', 'B', 'C'].map(op => {
                                        const isSelected = opciones.includes(op);
                                        return (
                                          <button
                                            key={op}
                                            onClick={async () => {
                                              let newOpciones: string[];
                                              if (isSelected) {
                                                if (opciones.length === 1) {
                                                  toast.error('Debe haber al menos una opción seleccionada');
                                                  return;
                                                }
                                                newOpciones = opciones.filter(o => o !== op);
                                              } else {
                                                newOpciones = [...opciones, op].sort();
                                              }
                                              try {
                                                const { error } = await supabase
                                                  .from('budget_activities')
                                                  .update({ opciones: newOpciones })
                                                  .eq('id', activity.id);
                                                if (error) throw error;
                                                fetchData();
                                                toast.success(`Opciones actualizadas`);
                                              } catch (err: any) {
                                                toast.error('Error al actualizar opciones');
                                              }
                                            }}
                                            className="cursor-pointer hover:opacity-80 transition-opacity"
                                          >
                                            <Badge 
                                              variant={isSelected ? "default" : "outline"}
                                              className={`text-xs px-1.5 ${
                                                isSelected 
                                                  ? `${OPTION_COLORS[op]?.bg || ''} ${OPTION_COLORS[op]?.hover || ''} text-white` 
                                                  : `${OPTION_COLORS[op]?.borderSolid || ''}/40 ${OPTION_COLORS[op]?.text || ''} opacity-60 hover:opacity-100`
                                              }`}
                                            >
                                              {op}
                                            </Badge>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div className="flex gap-0.5">
                                      {opciones.map(op => (
                                        <Badge 
                                          key={op} 
                                          variant="outline" 
                                          className={`text-xs px-1.5 ${OPTION_COLORS[op]?.borderSolid || ''} ${OPTION_COLORS[op]?.text || ''}`}
                                        >
                                          {op}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>{activity.measurement_unit}</TableCell>
                                <TableCell className="text-right">
                                  {activity.measurement_id ? formatNumber(relatedUnits) : '-'}
                                </TableCell>
                                <TableCell className="text-sm max-w-[150px]">
                                  {canEditActivity(activity.id) ? (
                                    <MeasurementInlineSelect
                                      ref={(el) => registerCellRef(activity.id, el)}
                                      activityId={activity.id}
                                      value={activity.measurement_id}
                                      measurements={measurements}
                                      measurementRelations={measurementRelations}
                                      onSave={(measurementId) => handleUpdateActivityMeasurement(activity.id, measurementId)}
                                      onTabNext={() => navigateToMeasurementField(activity.id, 'next')}
                                      onTabPrev={() => navigateToMeasurementField(activity.id, 'prev')}
                                      onArrowUp={() => navigateToRow(activity.id, 'up')}
                                      onArrowDown={() => navigateToRow(activity.id, 'down')}
                                    />
                                  ) : (
                                    <span className="text-muted-foreground truncate" title={medicionId}>
                                      {medicionId}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right font-mono font-semibold text-primary">
                                  {formatCurrency(activity.resources_subtotal || 0)}
                                </TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="sm" onClick={() => handleManageFiles(activity)}>
                                    <File className="h-4 w-4 mr-1" />{activity.files_count || 0}
                                  </Button>
                                </TableCell>
                                {canEditActivity(activity.id) && (
                                  <TableCell>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => handleEdit(activity)}>
                                          <Pencil className="h-4 w-4 mr-2" />Editar
                                        </DropdownMenuItem>
                                        {isAdmin && (
                                          <>
                                            <DropdownMenuItem onClick={() => handleDuplicate(activity)}>
                                              <Copy className="h-4 w-4 mr-2" />Duplicar
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleDeleteClick(activity)} className="text-destructive">
                                              <Trash2 className="h-4 w-4 mr-2" />Eliminar
                                            </DropdownMenuItem>
                                          </>
                                        )}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </TableCell>
                                )}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}

          {filteredActivities.length === 0 && (
            <div className="text-center py-8 text-muted-foreground border rounded-lg">
              {searchTerm 
                ? 'No se encontraron actividades con ese criterio'
                : 'No hay actividades. Crea una nueva o importa desde CSV.'}
            </div>
          )}
        </div>
      )}

      {/* Work Area Grouped View */}
      {viewMode === 'workarea' && (
        <ActivitiesWorkAreaGroupedView
          activities={filteredActivities}
          phases={phases}
          workAreas={workAreas}
          workAreaRelations={workAreaRelations}
          measurements={measurements}
          measurementRelations={measurementRelations}
          permissions={permissions}
          canEditActivity={canEditActivity}
          onEdit={handleEdit}
          onDuplicate={handleDuplicate}
          onDelete={handleDeleteClick}
          onManageFiles={handleManageFiles}
          onUpdateMeasurement={handleUpdateActivityMeasurement}
          onUpdateWorkAreas={handleUpdateActivityWorkAreas}
          generateActivityId={generateActivityId}
          getMeasurementData={getMeasurementData}
        />
      )}

      {/* Time Management View */}
      {viewMode === 'time' && (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ActividadID</TableHead>
                <TableHead>Fase</TableHead>
                <TableHead>Fecha Inicio</TableHead>
                <TableHead className="text-center">Duración (días)</TableHead>
                <TableHead className="text-center">Tolerancia (días)</TableHead>
                <TableHead>Fecha Fin</TableHead>
                {(isAdmin || permissions.canEdit) && <TableHead className="w-20">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...filteredActivities]
                .sort((a, b) => {
                  if (!a.start_date && !b.start_date) return 0;
                  if (!a.start_date) return 1;
                  if (!b.start_date) return -1;
                  return a.start_date.localeCompare(b.start_date);
                })
                .map((activity) => {
                  const phase = getPhaseById(activity.phase_id);
                  return (
                    <TableRow key={activity.id}>
                      <TableCell className="font-mono text-sm">{generateActivityId(activity)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {phase ? `${phase.code} ${phase.name}` : '-'}
                      </TableCell>
                      <TableCell>
                        {canEditActivity(activity.id) ? (
                          <Input
                            type="date"
                            value={activity.start_date || ''}
                            min={budgetStartDate || undefined}
                            max={budgetEndDate || undefined}
                            onChange={async (e) => {
                              const newValue = e.target.value || null;
                              try {
                                const { error } = await supabase
                                  .from('budget_activities')
                                  .update({ start_date: newValue })
                                  .eq('id', activity.id);
                                if (error) throw error;
                                fetchData();
                                toast.success('Fecha actualizada');
                              } catch (err) {
                                toast.error('Error al actualizar');
                              }
                            }}
                            className="w-36 h-8"
                          />
                        ) : (
                          <span>
                            {activity.start_date 
                              ? format(parseISO(activity.start_date), 'dd/MM/yyyy', { locale: es })
                              : '-'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {canEditActivity(activity.id) ? (
                          <Input
                            type="number"
                            value={activity.duration_days ?? ''}
                            min={0}
                            onChange={async (e) => {
                              const newValue = e.target.value ? parseInt(e.target.value) : null;
                              try {
                                const { error } = await supabase
                                  .from('budget_activities')
                                  .update({ duration_days: newValue })
                                  .eq('id', activity.id);
                                if (error) throw error;
                                fetchData();
                                toast.success('Duración actualizada');
                              } catch (err) {
                                toast.error('Error al actualizar');
                              }
                            }}
                            className="w-20 h-8 text-center mx-auto"
                          />
                        ) : (
                          <span>{activity.duration_days ?? '-'}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {canEditActivity(activity.id) ? (
                          <Input
                            type="number"
                            value={activity.tolerance_days ?? ''}
                            min={0}
                            onChange={async (e) => {
                              const newValue = e.target.value ? parseInt(e.target.value) : null;
                              try {
                                const { error } = await supabase
                                  .from('budget_activities')
                                  .update({ tolerance_days: newValue })
                                  .eq('id', activity.id);
                                if (error) throw error;
                                fetchData();
                                toast.success('Tolerancia actualizada');
                              } catch (err) {
                                toast.error('Error al actualizar');
                              }
                            }}
                            className="w-20 h-8 text-center mx-auto"
                          />
                        ) : (
                          <span>{activity.tolerance_days ?? '-'}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {activity.end_date 
                          ? format(parseISO(activity.end_date), 'dd/MM/yyyy', { locale: es })
                          : '-'}
                      </TableCell>
                      {canEditActivity(activity.id) && (
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(activity)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              {isAdmin && (
                                <DropdownMenuItem onClick={() => handleDeleteClick(activity)} className="text-destructive">
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Eliminar
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              {filteredActivities.length === 0 && (
                <TableRow>
                  <TableCell colSpan={(isAdmin || permissions.canEdit) ? 7 : 6} className="text-center py-8 text-muted-foreground">
                    {searchTerm 
                      ? 'No se encontraron actividades con ese criterio'
                      : 'No hay actividades. Crea una nueva o importa desde CSV.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>
                {editingActivity ? 'Editar Actividad' : 'Nueva Actividad'}
              </DialogTitle>
              {editingActivity && (
                <div className="flex items-center gap-1 mr-6">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => navigateToActivity('prev')}
                    title="Actividad anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => navigateToActivity('next')}
                    title="Actividad siguiente"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <DialogDescription>
              {editingActivity 
                ? 'Modifica los datos de la actividad'
                : 'Introduce los datos de la nueva actividad'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">Código *</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="Ej: 001A"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unidad de Medida</Label>
                <Select 
                  value={form.measurement_unit} 
                  onValueChange={(value) => setForm({ ...form, measurement_unit: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEASUREMENT_UNITS.map(unit => (
                      <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="phase">Fase de Gestión</Label>
                <Select 
                  value={form.phase_id || 'none'} 
                  onValueChange={(value) => {
                    const newPhaseId = value === 'none' ? '' : value;
                    // Auto-set start_date from phase if not already set
                    if (newPhaseId && !form.start_date) {
                      const phase = phases.find(p => p.id === newPhaseId);
                      if (phase?.start_date) {
                        setForm({ ...form, phase_id: newPhaseId, start_date: phase.start_date });
                        return;
                      }
                    }
                    setForm({ ...form, phase_id: newPhaseId });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar fase..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin fase</SelectItem>
                    {phases.map(phase => (
                      <SelectItem key={phase.id} value={phase.id}>
                        {phase.code} {phase.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between py-2 px-3 border rounded-lg bg-muted/30">
              <div className="space-y-0.5">
                <Label htmlFor="uses_measurement" className="text-sm font-medium">Usa Medición</Label>
                <p className="text-xs text-muted-foreground">Si NO, las Uds relacionadas serán 0,00</p>
              </div>
              <Switch
                id="uses_measurement"
                checked={form.uses_measurement}
                onCheckedChange={(checked) => setForm({ ...form, uses_measurement: checked })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Nombre de la Actividad *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej: Construcción losa cimentación"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Descripción detallada de la actividad..."
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="measurement">Medición Relacionada</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal"
                    >
                      {form.measurement_id 
                        ? (() => {
                            const m = measurements.find(m => m.id === form.measurement_id);
                            return m ? m.name : 'Seleccionar medición...'
                          })()
                        : 'Sin medición'}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[350px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar medición..." />
                      <CommandList className="max-h-[200px]">
                        <CommandEmpty>No se encontraron mediciones</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="none"
                            onSelect={() => setForm({ ...form, measurement_id: '' })}
                          >
                            <span className="text-muted-foreground italic">Sin medición</span>
                          </CommandItem>
                          {measurements
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map(m => (
                              <CommandItem
                                key={m.id}
                                value={m.name}
                                onSelect={() => setForm({ ...form, measurement_id: m.id })}
                              >
                                {m.name} ({formatNumber(m.manual_units || 0)} {m.measurement_unit || 'ud'})
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Opciones Field */}
            <div className="flex items-center justify-between py-2 px-3 border rounded-lg bg-muted/30">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Opciones</Label>
                <p className="text-xs text-muted-foreground">Selecciona en qué opciones (A, B, C) está incluida esta actividad</p>
              </div>
              <div className="flex gap-3">
                {['A', 'B', 'C'].map(opcion => (
                  <label key={opcion} className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox
                      checked={form.opciones.includes(opcion)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setForm({ ...form, opciones: [...form.opciones, opcion].sort() });
                        } else {
                          setForm({ ...form, opciones: form.opciones.filter(o => o !== opcion) });
                        }
                      }}
                    />
                    <span className={`text-sm font-medium ${
                      opcion === 'A' ? 'text-blue-600' :
                      opcion === 'B' ? 'text-amber-600' :
                      'text-emerald-600'
                    }`}>{opcion}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Work Areas Field */}
            <div className="space-y-2 py-2 px-3 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Áreas de Trabajo
                  </Label>
                  <p className="text-xs text-muted-foreground">Selecciona las áreas donde aplica esta actividad</p>
                </div>
              </div>
              
              <div className="space-y-3 mt-2">
                {/* Selected work areas - always shown */}
                {form.work_area_ids.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Áreas seleccionadas:</p>
                    <div className="flex flex-wrap gap-2">
                      {form.work_area_ids.map(waId => {
                        const wa = workAreas.find(w => w.id === waId);
                        if (!wa) return null;
                        return (
                          <Badge
                            key={wa.id}
                            variant="default"
                            className="cursor-pointer"
                            onClick={() => setForm({ ...form, work_area_ids: form.work_area_ids.filter(id => id !== wa.id) })}
                          >
                            {wa.name} <code className="text-xs ml-1 opacity-70">({wa.level}/{wa.work_area})</code>
                            <X className="h-3 w-3 ml-1" />
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {/* Search and add work areas */}
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar áreas por nombre..."
                      value={workAreaSearchQuery}
                      onChange={(e) => {
                        setWorkAreaSearchQuery(e.target.value);
                        if (e.target.value) setShowAllWorkAreas(true);
                      }}
                      className="pl-9 h-9"
                    />
                  </div>
                  
                  {workAreas.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay áreas de trabajo definidas</p>
                  ) : (
                    <>
                      {!showAllWorkAreas && form.work_area_ids.length === 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowAllWorkAreas(true)}
                          className="text-xs"
                        >
                          Mostrar todas las áreas disponibles
                        </Button>
                      )}
                      
                      {(showAllWorkAreas || workAreaSearchQuery) && (
                        <div className="max-h-40 overflow-y-auto space-y-1 border rounded-md p-2 bg-background">
                          {workAreas
                            .filter(wa => !form.work_area_ids.includes(wa.id))
                            .filter(wa => {
                              if (!workAreaSearchQuery) return true;
                              const searchLower = workAreaSearchQuery.toLowerCase();
                              const fullText = `${wa.name} ${wa.level} ${wa.work_area}`.toLowerCase();
                              return fullText.includes(searchLower);
                            })
                            .map(wa => (
                              <div
                                key={wa.id}
                                className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer transition-colors"
                                onClick={() => setForm({ ...form, work_area_ids: [...form.work_area_ids, wa.id] })}
                              >
                                <Badge variant="outline" className="cursor-pointer">
                                  {wa.name} <code className="text-xs ml-1 opacity-70">({wa.level}/{wa.work_area})</code>
                                </Badge>
                              </div>
                            ))
                          }
                          {workAreas
                            .filter(wa => !form.work_area_ids.includes(wa.id))
                            .filter(wa => {
                              if (!workAreaSearchQuery) return true;
                              const searchLower = workAreaSearchQuery.toLowerCase();
                              const fullText = `${wa.name} ${wa.level} ${wa.work_area}`.toLowerCase();
                              return fullText.includes(searchLower);
                            }).length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-2">
                              {workAreaSearchQuery ? 'No se encontraron áreas' : 'No hay más áreas disponibles'}
                            </p>
                          )}
                        </div>
                      )}
                      
                      {showAllWorkAreas && !workAreaSearchQuery && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowAllWorkAreas(false)}
                          className="text-xs"
                        >
                          Ocultar lista
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Time Management Fields */}
            <div className="grid grid-cols-4 gap-4 p-3 border rounded-lg bg-muted/30">
              <div className="space-y-2">
                <Label htmlFor="start_date">Fecha Inicio</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={form.start_date}
                  min={budgetStartDate || undefined}
                  max={budgetEndDate || undefined}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
                {form.phase_id && !form.start_date && (
                  <Button 
                    type="button" 
                    variant="link" 
                    size="sm" 
                    className="h-auto p-0 text-xs"
                    onClick={() => {
                      const phase = phases.find(p => p.id === form.phase_id);
                      if (phase?.start_date) {
                        setForm({ ...form, start_date: phase.start_date });
                      }
                    }}
                  >
                    Usar fecha de la fase
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration_days">Duración (días)</Label>
                <Input
                  id="duration_days"
                  type="number"
                  min="0"
                  value={form.duration_days}
                  onChange={(e) => setForm({ ...form, duration_days: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tolerance_days">Tolerancia (días)</Label>
                <Input
                  id="tolerance_days"
                  type="number"
                  min="0"
                  value={form.tolerance_days}
                  onChange={(e) => setForm({ ...form, tolerance_days: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Fecha Fin Estimada</Label>
                <div className="h-10 px-3 py-2 border rounded-md bg-muted text-sm flex items-center">
                  {form.start_date && (form.duration_days || form.tolerance_days) ? (
                    format(
                      addDays(
                        parseISO(form.start_date), 
                        (parseInt(form.duration_days) || 0) + (parseInt(form.tolerance_days) || 0)
                      ),
                      'dd/MM/yyyy',
                      { locale: es }
                    )
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </div>
              </div>
            </div>

            {/* Fechas Reales de Ejecución */}
            <div className="border-t pt-4 mt-4">
              <Label className="text-base font-semibold mb-3 block">Fechas Reales de Ejecución</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="actual_start_date">Inicio Real</Label>
                  <Input
                    id="actual_start_date"
                    type="date"
                    value={form.actual_start_date}
                    onChange={(e) => setForm({ ...form, actual_start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="actual_end_date">Fin Real</Label>
                  <Input
                    id="actual_end_date"
                    type="date"
                    value={form.actual_end_date}
                    onChange={(e) => setForm({ ...form, actual_end_date: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Resources list for existing activities */}
            {editingActivity && (
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Label className="text-base font-semibold">Recursos asociados ({activityResources.length})</Label>
                    <Badge variant="default" className="text-sm">
                      €SubTotal: {formatCurrency(calculateResourceSubtotal(activityResources, editingActivity?.measurement_id))}
                    </Badge>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={openExistingResourcePicker}
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        Añadir existente
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleNewResource}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Nuevo Recurso
                      </Button>
                    </div>
                  )}
                </div>
                {activityResources.length > 0 ? (
                  <div className="border rounded-lg max-h-80 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-xs">
                          <TableHead className="py-2">Recurso</TableHead>
                          <TableHead className="py-2">Tipo</TableHead>
                          <TableHead className="py-2 text-right">€Coste ud ext</TableHead>
                          <TableHead className="py-2">Ud</TableHead>
                          <TableHead className="py-2 text-right">%Seg</TableHead>
                          <TableHead className="py-2 text-right">%Venta</TableHead>
                          <TableHead className="py-2 text-right">Ud manual</TableHead>
                          <TableHead className="py-2 text-right">Uds relac</TableHead>
                          <TableHead className="py-2 text-right">Uds calc</TableHead>
                          <TableHead className="py-2 text-right">€SubTotal</TableHead>
                          <TableHead className="py-2 w-28">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activityResources.map((resource) => {
                          const externalCost = resource.external_unit_cost || 0;
                          const safetyPercent = percentToRatio(resource.safety_margin_percent, 0.15);
                          const salesPercent = percentToRatio(resource.sales_margin_percent, 0.25);
                          const salesCostUd = externalCost * (1 + safetyPercent) * (1 + salesPercent);
                          
                          // Calculate related units in real-time from activity's measurement
                          let liveRelatedUnits = resource.related_units || 0;
                          if (editingActivity?.measurement_id) {
                            const measurement = measurements.find(m => m.id === editingActivity.measurement_id);
                            if (measurement) {
                              // Get related measurements
                              const relatedMeasurementIds = measurementRelations
                                .filter(r => r.measurement_id === measurement.id)
                                .map(r => r.related_measurement_id);
                              
                              if (relatedMeasurementIds.length > 0) {
                                // Sum of related measurements' manual_units
                                liveRelatedUnits = relatedMeasurementIds.reduce((sum, relId) => {
                                  const relMeasurement = measurements.find(m => m.id === relId);
                                  return sum + (relMeasurement?.manual_units || 0);
                                }, 0);
                              } else {
                                // No relations, use measurement's own manual_units
                                liveRelatedUnits = measurement.manual_units || 0;
                              }
                            }
                          }
                          
                          const calculatedUnits = resource.manual_units !== null 
                            ? resource.manual_units 
                            : liveRelatedUnits;
                          const subtotal = calculatedUnits * salesCostUd;
                          
                          const handleInlineUpdate = async (field: string, value: any) => {
                            try {
                              console.log(`Updating ${field} to:`, value, typeof value);
                              const { error } = await supabase
                                .from('budget_activity_resources')
                                .update({ [field]: value })
                                .eq('id', resource.id);
                              if (error) throw error;
                              // Update local state
                              setActivityResources(prev => 
                                prev.map(r => r.id === resource.id ? { ...r, [field]: value } : r)
                              );
                            } catch (err: any) {
                              console.error('Error updating resource:', err);
                              toast.error('Error al actualizar');
                            }
                          };

                          const resourceTypeIcon = resource.resource_type === 'Producto' ? <Package className="h-3 w-3" /> 
                            : resource.resource_type === 'Mano de obra' ? <Wrench className="h-3 w-3" />
                            : resource.resource_type === 'Alquiler' ? <Truck className="h-3 w-3" />
                            : resource.resource_type === 'Servicio' ? <Briefcase className="h-3 w-3" />
                            : resource.resource_type === 'Tarea' ? <CheckSquare className="h-3 w-3" />
                            : null;
                          
                          return (
                            <TableRow key={resource.id} className="text-sm">
                              <TableCell className="py-1.5 font-medium">{resource.name}</TableCell>
                              <TableCell className="py-1.5">
                                {isAdmin ? (
                                  <ResourceInlineEdit
                                    value={resource.resource_type || ''}
                                    type="select"
                                    options={[
                                      { value: 'Producto', label: 'Producto' },
                                      { value: 'Mano de obra', label: 'Mano de obra' },
                                      { value: 'Alquiler', label: 'Alquiler' },
                                      { value: 'Servicio', label: 'Servicio' },
                                      { value: 'Tarea', label: 'Tarea' },
                                    ]}
                                    displayValue={
                                      resource.resource_type ? (
                                        <Badge variant="outline" className="text-xs flex items-center gap-1 w-fit">
                                          {resourceTypeIcon}
                                          {resource.resource_type}
                                        </Badge>
                                      ) : '-'
                                    }
                                    onSave={async (v) => handleInlineUpdate('resource_type', v)}
                                  />
                                ) : (
                                  resource.resource_type ? (
                                    <Badge variant="outline" className="text-xs flex items-center gap-1">
                                      {resourceTypeIcon}
                                      {resource.resource_type}
                                    </Badge>
                                  ) : '-'
                                )}
                              </TableCell>
                              <TableCell className="py-1.5 text-right">
                                {isAdmin ? (
                                  <ResourceInlineEdit
                                    value={externalCost}
                                    type="number"
                                    decimals={2}
                                    displayValue={<span className="font-mono">{formatCurrency(externalCost)}</span>}
                                    onSave={async (v) => handleInlineUpdate('external_unit_cost', v)}
                                  />
                                ) : (
                                  <span className="font-mono">{formatCurrency(externalCost)}</span>
                                )}
                              </TableCell>
                              <TableCell className="py-1.5">
                                {isAdmin ? (
                                  <ResourceInlineEdit
                                    value={resource.unit || ''}
                                    type="select"
                                    options={['m2', 'm3', 'ml', 'ud', 'h', 'día', 'mes', 'kg', 'l', 'km'].map(u => ({ value: u, label: u }))}
                                    displayValue={resource.unit || '-'}
                                    onSave={async (v) => handleInlineUpdate('unit', v)}
                                  />
                                ) : (
                                  resource.unit || '-'
                                )}
                              </TableCell>
                              <TableCell className="py-1.5 text-right">
                                {isAdmin ? (
                                  <ResourceInlineEdit
                                    value={safetyPercent * 100}
                                    type="percent"
                                    decimals={1}
                                    displayValue={<span className="font-mono">{formatPercent(safetyPercent)}</span>}
                                    onSave={async (v) => handleInlineUpdate('safety_margin_percent', Math.max(0, v as number) / 100)}
                                  />
                                ) : (
                                  <span className="font-mono">{formatPercent(safetyPercent)}</span>
                                )}
                              </TableCell>
                              <TableCell className="py-1.5 text-right">
                                {isAdmin ? (
                                  <ResourceInlineEdit
                                    value={salesPercent * 100}
                                    type="percent"
                                    decimals={1}
                                    displayValue={<span className="font-mono">{formatPercent(salesPercent)}</span>}
                                    onSave={async (v) => handleInlineUpdate('sales_margin_percent', Math.max(0, v as number) / 100)}
                                  />
                                ) : (
                                  <span className="font-mono">{formatPercent(salesPercent)}</span>
                                )}
                              </TableCell>
                              <TableCell className="py-1.5 text-right">
                                {isAdmin ? (
                                  <ResourceInlineEdit
                                    value={resource.manual_units}
                                    type="number"
                                    decimals={2}
                                    allowNull={true}
                                    displayValue={<span className="font-mono">{resource.manual_units !== null ? formatNumber(resource.manual_units) : '-'}</span>}
                                    onSave={async (v) => handleInlineUpdate('manual_units', v)}
                                  />
                                ) : (
                                  <span className="font-mono">{resource.manual_units !== null ? formatNumber(resource.manual_units) : '-'}</span>
                                )}
                              </TableCell>
                              <TableCell className="py-1.5 text-right font-mono text-muted-foreground">
                                {formatNumber(liveRelatedUnits)}
                              </TableCell>
                              <TableCell className="py-1.5 text-right font-mono font-semibold">
                                {formatNumber(calculatedUnits)}
                              </TableCell>
                              <TableCell className="py-1.5 text-right font-mono font-semibold text-primary">
                                {formatCurrency(subtotal)}
                              </TableCell>
                              <TableCell className="py-1.5">
                                <div className="flex gap-1">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-7 w-7"
                                    onClick={() => {
                                      setViewingResource(resource);
                                      setResourceDetailDialogOpen(true);
                                    }}
                                    title="Ver detalle"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                  {isAdmin && (
                                    <>
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-7 w-7"
                                        onClick={() => openDuplicateResourceDialog(resource)}
                                        title="Duplicar"
                                      >
                                        <Copy className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-7 w-7"
                                        onClick={() => handleEditResource(resource.id)}
                                        title="Editar"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-7 w-7 text-destructive"
                                        onClick={() => handleDeleteResource(resource.id)}
                                        title="Eliminar"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground border rounded-lg">
                    No hay recursos asociados a esta actividad
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resource Detail Dialog */}
      <Dialog open={resourceDetailDialogOpen} onOpenChange={setResourceDetailDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle del Recurso</DialogTitle>
            <DialogDescription>
              Información completa del recurso
            </DialogDescription>
          </DialogHeader>
          
          {viewingResource && (() => {
            const externalCost = viewingResource.external_unit_cost || 0;
            const safetyPercent = viewingResource.safety_margin_percent ?? 0.15;
            const salesPercent = viewingResource.sales_margin_percent ?? 0.25;
            const safetyMarginUd = externalCost * safetyPercent;
            const internalCostUd = externalCost + safetyMarginUd;
            const salesMarginUd = internalCostUd * salesPercent;
            const salesCostUd = internalCostUd + salesMarginUd;
            const calculatedUnits = viewingResource.manual_units !== null 
              ? viewingResource.manual_units 
              : (viewingResource.related_units || 0);
            const subtotal = calculatedUnits * salesCostUd;
            
            return (
              <div className="space-y-4 py-4">
                {/* Resource name and type */}
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">{viewingResource.name}</h3>
                    {viewingResource.resource_type && (
                      <Badge variant="outline" className="flex items-center gap-1">
                        {viewingResource.resource_type === 'Producto' && <Package className="h-3 w-3" />}
                        {viewingResource.resource_type === 'Mano de obra' && <Wrench className="h-3 w-3" />}
                        {viewingResource.resource_type === 'Alquiler' && <Truck className="h-3 w-3" />}
                        {viewingResource.resource_type === 'Servicio' && <Briefcase className="h-3 w-3" />}
                        {viewingResource.resource_type === 'Tarea' && <CheckSquare className="h-3 w-3" />}
                        {viewingResource.resource_type}
                      </Badge>
                    )}
                </div>
                
                {/* Cost breakdown */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <p className="text-muted-foreground text-xs">€Coste ud externa</p>
                    <p className="font-mono font-semibold">{formatCurrency(externalCost)}</p>
                  </div>
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <p className="text-muted-foreground text-xs">Unidad medida</p>
                    <p className="font-semibold">{viewingResource.unit || '-'}</p>
                  </div>
                </div>
                
                {/* Margins */}
                <div className="border rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Márgenes</p>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">%Seguridad</p>
                      <p className="font-mono">{(safetyPercent * 100).toFixed(0)}%</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">€Margen seg.</p>
                      <p className="font-mono">{formatCurrency(safetyMarginUd)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">€Coste interno</p>
                      <p className="font-mono">{formatCurrency(internalCostUd)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm pt-2 border-t">
                    <div>
                      <p className="text-muted-foreground text-xs">%Venta</p>
                      <p className="font-mono">{(salesPercent * 100).toFixed(0)}%</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">€Margen venta</p>
                      <p className="font-mono">{formatCurrency(salesMarginUd)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">€Coste venta ud</p>
                      <p className="font-mono font-semibold text-primary">{formatCurrency(salesCostUd)}</p>
                    </div>
                  </div>
                </div>
                
                {/* Units */}
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <p className="text-muted-foreground text-xs">Uds manual</p>
                    <p className="font-mono">{viewingResource.manual_units !== null ? viewingResource.manual_units : '-'}</p>
                  </div>
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <p className="text-muted-foreground text-xs">Uds relacionadas</p>
                    <p className="font-mono">{viewingResource.related_units !== null ? viewingResource.related_units : '-'}</p>
                  </div>
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <p className="text-muted-foreground text-xs">Uds calculadas</p>
                    <p className="font-mono font-semibold">{calculatedUnits}</p>
                  </div>
                </div>
                
                {/* Total */}
                <div className="bg-primary/10 p-4 rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">€SubTotal venta</p>
                  <p className="text-2xl font-bold text-primary font-mono">{formatCurrency(subtotal)}</p>
                </div>
              </div>
            );
          })()}
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setResourceDetailDialogOpen(false)}>
              Cerrar
            </Button>
            {isAdmin && viewingResource && editingActivity && (
              <Button onClick={() => {
                // Prepare resource data for the form
                setEditingResourceForForm({
                  id: viewingResource.id,
                  budget_id: editingActivity.budget_id,
                  name: viewingResource.name,
                  external_unit_cost: viewingResource.external_unit_cost,
                  unit: viewingResource.unit,
                  resource_type: viewingResource.resource_type,
                  safety_margin_percent: viewingResource.safety_margin_percent,
                  sales_margin_percent: viewingResource.sales_margin_percent,
                  manual_units: viewingResource.manual_units,
                  related_units: viewingResource.related_units,
                  activity_id: editingActivity.id,
                  description: null,
                });
                setResourceDetailDialogOpen(false);
                setResourceFormOpen(true);
              }}>
                <Pencil className="h-4 w-4 mr-2" />
                Editar completo
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Existing Resource Picker Dialog */}
      <Dialog open={existingResourcePickerOpen} onOpenChange={setExistingResourcePickerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Añadir recurso existente</DialogTitle>
            <DialogDescription>
              Selecciona un recurso del presupuesto para duplicarlo en esta actividad.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Buscar recurso..."
                value={existingResourcesQuery}
                onValueChange={setExistingResourcesQuery}
              />
              <CommandList className="max-h-[360px]">
                <CommandEmpty>
                  {existingResourcesLoading ? 'Cargando...' : 'No se encontraron recursos.'}
                </CommandEmpty>
                <CommandGroup>
                  {existingResources
                    .filter((r) => {
                      const q = existingResourcesQuery.toLowerCase().trim();
                      if (!q) return true;
                      return (
                        r.name.toLowerCase().includes(q) ||
                        (r.resource_type || '').toLowerCase().includes(q) ||
                        String(r.external_unit_cost ?? '').includes(q)
                      );
                    })
                    .map((r) => {
                      const originActivity = r.activity_id ? activities.find((a) => a.id === r.activity_id) : null;
                      const originLabel = originActivity ? generateActivityId(originActivity) : 'Sin actividad';

                      return (
                        <CommandItem
                          key={r.id}
                          value={r.id}
                          onSelect={() => {
                            setExistingResourcePickerOpen(false);
                            openDuplicateResourceDialog(r);
                          }}
                          className="cursor-pointer"
                        >
                          <div className="flex w-full items-center justify-between gap-4">
                            <div className="min-w-0">
                              <p className="font-medium truncate">{r.name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {originLabel} · {r.resource_type || 'Sin tipo'} · {r.unit || 'ud'}
                              </p>
                            </div>
                            <div className="text-right shrink-0 font-mono text-sm">
                              {formatCurrency(r.external_unit_cost || 0)}
                            </div>
                          </div>
                        </CommandItem>
                      );
                    })}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setExistingResourcePickerOpen(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Resource Dialog */}
      <Dialog open={duplicateResourceDialogOpen} onOpenChange={setDuplicateResourceDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicar Recurso</DialogTitle>
            <DialogDescription>
              Introduce el nombre para el nuevo recurso duplicado
            </DialogDescription>
          </DialogHeader>
          
          {(() => {
            const trimmedName = duplicateResourceName.trim();
            const isDuplicateName = trimmedName && activityResources.some(
              r => r.name.toLowerCase() === trimmedName.toLowerCase() && r.id !== duplicatingResource?.id
            );
            
            return (
              <>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="duplicate-name">Nombre del recurso *</Label>
                    <Input
                      id="duplicate-name"
                      value={duplicateResourceName}
                      onChange={(e) => setDuplicateResourceName(e.target.value)}
                      placeholder="Nombre del recurso"
                      maxLength={200}
                      autoFocus
                      className={isDuplicateName ? 'border-destructive focus-visible:ring-destructive' : ''}
                    />
                    {isDuplicateName && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <X className="h-3.5 w-3.5" />
                        Ya existe un recurso con este nombre en la actividad
                      </p>
                    )}
                  </div>
                  
                  {duplicatingResource && (
                    <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                      <p>Recurso original: <span className="font-medium">{duplicatingResource.name}</span></p>
                      <p>Tipo: {duplicatingResource.resource_type || '-'}</p>
                      <p>€Coste ud: {formatCurrency(duplicatingResource.external_unit_cost || 0)}</p>
                    </div>
                  )}
                </div>
                
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDuplicateResourceDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleDuplicateResource} 
                    disabled={!trimmedName || isDuplicateName}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Duplicar
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar Actividades</DialogTitle>
            <DialogDescription>
              Importa actividades desde un archivo CSV. El archivo debe tener las columnas: Actividad, Código actividad
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv,.xlsx,.xls"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              
              {importFile ? (
                <div className="flex items-center justify-center gap-2">
                  <File className="h-8 w-8 text-primary" />
                  <div>
                    <p className="font-medium">{importFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(importFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => setImportFile(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div>
                  <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-2">
                    Arrastra un archivo CSV o haz clic para seleccionar
                  </p>
                  <Button 
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Seleccionar archivo
                  </Button>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleImport} disabled={!importFile || isImporting}>
              {isImporting ? 'Importando...' : 'Importar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Files Dialog */}
      <Dialog open={filesDialogOpen} onOpenChange={setFilesDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Archivos de: {selectedActivity?.name}</DialogTitle>
            <DialogDescription>
              Gestiona los archivos multimedia de esta actividad
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {isAdmin && (
              <div className="flex justify-end">
                <input
                  type="file"
                  ref={activityFileInputRef}
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button onClick={() => activityFileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  Subir archivo
                </Button>
              </div>
            )}

            {activityFiles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No hay archivos adjuntos
              </div>
            ) : (
              <div className="space-y-2">
                {activityFiles.map((file) => (
                  <div 
                    key={file.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <File className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{file.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(file.file_size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleDownloadFile(file)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {isAdmin && (
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleDeleteFile(file)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFilesDialogOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Eliminar Actividad"
        description={`¿Estás seguro de que quieres eliminar la actividad "${deletingActivity?.name}"? Esta acción no se puede deshacer.`}
      />

      {/* Budget Resource Form for Full Edit */}
      {editingActivity && (
        <BudgetResourceForm
          open={resourceFormOpen}
          onOpenChange={setResourceFormOpen}
          budgetId={editingActivity.budget_id}
          resource={editingResourceForForm}
          activities={activities.map(a => ({
            id: a.id,
            code: a.code,
            name: a.name,
            phase_id: a.phase_id
          }))}
          phases={phases.map(p => ({
            id: p.id,
            code: p.code,
            name: p.name
          }))}
          onSave={async () => {
            setResourceFormOpen(false);
            setEditingResourceForForm(null);
            // Refresh resources for the current activity
            if (editingActivity) {
              const resources = await fetchActivityResources(editingActivity.id);
              setActivityResources(resources);
            }
            // Also refresh main data
            fetchData();
          }}
        />
      )}
    </div>
  );
}
