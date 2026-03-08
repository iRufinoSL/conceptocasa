import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useUnreadEmailCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) { setCount(0); return; }

    const fetch = async () => {
      const { count: c } = await supabase
        .from('email_messages')
        .select('id', { count: 'exact', head: true })
        .eq('direction', 'inbound')
        .or('is_read.is.null,is_read.eq.false')
        .is('deleted_at', null);
      setCount(c ?? 0);
    };

    fetch();

    const channel = supabase
      .channel('unread-emails')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'email_messages' }, () => fetch())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return count;
}
