import { useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

type BroadcastEventType = 
  | 'activity-changed'
  | 'resource-changed'
  | 'phase-changed'
  | 'work-area-changed'
  | 'measurement-changed';

interface BroadcastPayload {
  type: BroadcastEventType;
  budgetId: string;
  entityId?: string;
  action: 'create' | 'update' | 'delete';
  timestamp: number;
}

interface UseBudgetBroadcastOptions {
  budgetId: string;
  onBroadcast?: (payload: BroadcastPayload) => void;
  enabled?: boolean;
}

/**
 * Hook for instant cross-tab/cross-user synchronization via Supabase Broadcast.
 * 
 * This provides faster sync than Postgres Changes realtime because:
 * - Broadcast is direct client-to-client (no DB round-trip)
 * - Typical latency: 50-100ms vs 200-500ms for postgres_changes
 * 
 * Use this in combination with immediate refetch after mutations for best UX:
 * 1. Mutation → 2. Immediate refetch (for local state) → 3. Broadcast (for other clients)
 */
export function useBudgetBroadcast({ budgetId, onBroadcast, enabled = true }: UseBudgetBroadcastOptions) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!enabled || !budgetId) return;

    const channelName = `budget-broadcast-${budgetId}`;
    const channel = supabase.channel(channelName);

    channel
      .on('broadcast', { event: 'data-change' }, ({ payload }) => {
        if (payload && onBroadcast) {
          onBroadcast(payload as BroadcastPayload);
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [budgetId, enabled, onBroadcast]);

  /**
   * Broadcast a change event to all other connected clients.
   * Call this AFTER your mutation succeeds and local state is updated.
   */
  const broadcast = useCallback(async (
    type: BroadcastEventType,
    action: 'create' | 'update' | 'delete',
    entityId?: string
  ) => {
    if (!channelRef.current || !budgetId) return;

    const payload: BroadcastPayload = {
      type,
      budgetId,
      entityId,
      action,
      timestamp: Date.now(),
    };

    await channelRef.current.send({
      type: 'broadcast',
      event: 'data-change',
      payload,
    });
  }, [budgetId]);

  /**
   * Convenience methods for common broadcast types
   */
  const broadcastActivityChange = useCallback(
    (action: 'create' | 'update' | 'delete', activityId?: string) => 
      broadcast('activity-changed', action, activityId),
    [broadcast]
  );

  const broadcastResourceChange = useCallback(
    (action: 'create' | 'update' | 'delete', resourceId?: string) => 
      broadcast('resource-changed', action, resourceId),
    [broadcast]
  );

  const broadcastPhaseChange = useCallback(
    (action: 'create' | 'update' | 'delete', phaseId?: string) => 
      broadcast('phase-changed', action, phaseId),
    [broadcast]
  );

  const broadcastWorkAreaChange = useCallback(
    (action: 'create' | 'update' | 'delete', workAreaId?: string) => 
      broadcast('work-area-changed', action, workAreaId),
    [broadcast]
  );

  const broadcastMeasurementChange = useCallback(
    (action: 'create' | 'update' | 'delete', measurementId?: string) => 
      broadcast('measurement-changed', action, measurementId),
    [broadcast]
  );

  return {
    broadcast,
    broadcastActivityChange,
    broadcastResourceChange,
    broadcastPhaseChange,
    broadcastWorkAreaChange,
    broadcastMeasurementChange,
  };
}
