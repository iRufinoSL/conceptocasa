import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type SnapshotModule = 'plano' | 'actividades' | 'recursos';
export type SnapshotType = 'auto' | 'manual' | 'daily_first' | 'daily_mid' | 'daily_last';

export interface SnapshotEntry {
  id: string;
  module: SnapshotModule;
  snapshot_type: SnapshotType;
  label: string | null;
  created_at: string;
}

const SNAPSHOT_LABELS: Record<SnapshotType, string> = {
  auto: 'Automático',
  manual: 'Manual',
  daily_first: 'Primera del día',
  daily_mid: 'Intermedia del día',
  daily_last: 'Última del día',
};

const AUTO_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export function useModuleSnapshots(budgetId: string, module: SnapshotModule) {
  const [snapshots, setSnapshots] = useState<SnapshotEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const invoke = useCallback(async (body: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke('manage-snapshots', {
      body,
    });
    if (error) throw error;
    return data;
  }, []);

  const fetchSnapshots = useCallback(async () => {
    try {
      setLoading(true);
      const result = await invoke({ action: 'list', budget_id: budgetId, module });
      setSnapshots(result.snapshots || []);
    } catch (err) {
      console.error('Error fetching snapshots:', err);
    } finally {
      setLoading(false);
    }
  }, [budgetId, module, invoke]);

  const createSnapshot = useCallback(async (type: SnapshotType = 'manual', label?: string) => {
    try {
      setCreating(true);
      await invoke({
        action: 'create',
        budget_id: budgetId,
        module,
        snapshot_type: type,
        label,
      });
      if (type === 'manual') {
        toast.success('Punto de restauración creado');
      }
      await fetchSnapshots();
    } catch (err) {
      console.error('Error creating snapshot:', err);
      if (type === 'manual') {
        toast.error('Error al crear punto de restauración');
      }
    } finally {
      setCreating(false);
    }
  }, [budgetId, module, invoke, fetchSnapshots]);

  const restoreSnapshot = useCallback(async (snapshotId: string) => {
    try {
      setRestoring(true);
      await invoke({
        action: 'restore',
        budget_id: budgetId,
        module,
        snapshot_id: snapshotId,
      });
      toast.success('Datos restaurados correctamente. Se ha creado un backup de seguridad automático.');
      await fetchSnapshots();
      return true;
    } catch (err) {
      console.error('Error restoring snapshot:', err);
      toast.error('Error al restaurar los datos');
      return false;
    } finally {
      setRestoring(false);
    }
  }, [budgetId, module, invoke, fetchSnapshots]);

  // Auto-snapshot every 10 minutes
  useEffect(() => {
    // Initial snapshot on mount
    const initialTimer = setTimeout(() => {
      createSnapshot('auto');
    }, 5000); // Wait 5s after mount for data to settle

    timerRef.current = setInterval(() => {
      createSnapshot('auto');
    }, AUTO_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [createSnapshot]);

  // Fetch snapshots on mount
  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  const getSnapshotLabel = (s: SnapshotEntry) => {
    if (s.label) return s.label;
    return SNAPSHOT_LABELS[s.snapshot_type] || s.snapshot_type;
  };

  const getTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'ahora mismo';
    if (mins < 60) return `hace ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours}h`;
    const days = Math.floor(hours / 24);
    return `hace ${days}d`;
  };

  return {
    snapshots,
    loading,
    creating,
    restoring,
    createSnapshot,
    restoreSnapshot,
    fetchSnapshots,
    getSnapshotLabel,
    getTimeAgo,
  };
}
