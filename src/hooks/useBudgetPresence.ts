import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface PresenceState {
  user_id: string;
  user_name: string;
  user_email: string;
  active_tab: string | null;
  editing_entity_type: 'activity' | 'resource' | 'phase' | 'work_area' | null;
  editing_entity_id: string | null;
  joined_at: string;
}

interface UseBudgetPresenceOptions {
  budgetId: string;
  enabled?: boolean;
}

interface UseBudgetPresenceReturn {
  activeUsers: PresenceState[];
  currentUserPresence: PresenceState | null;
  updatePresence: (updates: Partial<Pick<PresenceState, 'active_tab' | 'editing_entity_type' | 'editing_entity_id'>>) => Promise<void>;
  isEntityLocked: (entityType: PresenceState['editing_entity_type'], entityId: string) => { locked: boolean; lockedBy?: PresenceState };
  clearEditingState: () => Promise<void>;
}

export function useBudgetPresence({ budgetId, enabled = true }: UseBudgetPresenceOptions): UseBudgetPresenceReturn {
  const { user } = useAuth();
  const [activeUsers, setActiveUsers] = useState<PresenceState[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const currentPresenceRef = useRef<PresenceState | null>(null);

  const getUserName = useCallback(() => {
    if (user?.user_metadata?.full_name) return user.user_metadata.full_name as string;
    if (user?.email) return user.email.split('@')[0];
    return 'Usuario';
  }, [user]);

  const createPresenceState = useCallback((overrides?: Partial<PresenceState>): PresenceState => {
    return {
      user_id: user?.id || '',
      user_name: getUserName(),
      user_email: user?.email || '',
      active_tab: null,
      editing_entity_type: null,
      editing_entity_id: null,
      joined_at: new Date().toISOString(),
      ...overrides,
    };
  }, [user, getUserName]);

  const updatePresence = useCallback(async (updates: Partial<Pick<PresenceState, 'active_tab' | 'editing_entity_type' | 'editing_entity_id'>>) => {
    if (!channelRef.current || !user?.id) return;

    const newState = createPresenceState({
      ...currentPresenceRef.current,
      ...updates,
    });

    currentPresenceRef.current = newState;
    await channelRef.current.track(newState);
  }, [user, createPresenceState]);

  const clearEditingState = useCallback(async () => {
    await updatePresence({
      editing_entity_type: null,
      editing_entity_id: null,
    });
  }, [updatePresence]);

  const isEntityLocked = useCallback((entityType: PresenceState['editing_entity_type'], entityId: string): { locked: boolean; lockedBy?: PresenceState } => {
    if (!entityType || !entityId || !user?.id) return { locked: false };

    const lockedBy = activeUsers.find(
      u => u.user_id !== user.id && 
           u.editing_entity_type === entityType && 
           u.editing_entity_id === entityId
    );

    return {
      locked: !!lockedBy,
      lockedBy,
    };
  }, [activeUsers, user]);

  useEffect(() => {
    if (!enabled || !budgetId || !user?.id) return;

    const channelName = `budget-presence-${budgetId}`;
    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState();
        const users: PresenceState[] = [];
        
        Object.values(presenceState).forEach((presenceList) => {
          if (Array.isArray(presenceList)) {
            presenceList.forEach((presence) => {
              if (presence && typeof presence === 'object' && 'user_id' in presence) {
                users.push(presence as unknown as PresenceState);
              }
            });
          }
        });

        setActiveUsers(users);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        const joiningUser = newPresences[0] as unknown as PresenceState | undefined;
        if (joiningUser && joiningUser.user_id !== user.id) {
          toast.info(`${joiningUser.user_name} ha entrado en el presupuesto`, {
            duration: 3000,
          });
        }
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        const leavingUser = leftPresences[0] as unknown as PresenceState | undefined;
        if (leavingUser && leavingUser.user_id !== user.id) {
          toast.info(`${leavingUser.user_name} ha salido del presupuesto`, {
            duration: 3000,
          });
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const initialState = createPresenceState();
          currentPresenceRef.current = initialState;
          await channel.track(initialState);
        }
      });

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [budgetId, user?.id, enabled, createPresenceState]);

  const currentUserPresence = activeUsers.find(u => u.user_id === user?.id) || null;

  return {
    activeUsers,
    currentUserPresence,
    updatePresence,
    isEntityLocked,
    clearEditingState,
  };
}
