import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Trade {
  id: string;
  name: string;
  created_at: string;
}

export function useTrades() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchTrades = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('resource_trades')
        .select('*')
        .order('name');

      if (error) throw error;
      setTrades(data || []);
    } catch (error) {
      console.error('Error fetching trades:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los oficios/sectores',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  const createTrade = async (name: string): Promise<Trade | null> => {
    try {
      const { data, error } = await supabase
        .from('resource_trades')
        .insert({ name: name.trim() })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          toast({
            title: 'Oficio existente',
            description: `"${name}" ya existe en la lista`,
            variant: 'destructive',
          });
          return null;
        }
        throw error;
      }

      await fetchTrades();
      return data;
    } catch (error) {
      console.error('Error creating trade:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear el oficio/sector',
        variant: 'destructive',
      });
      return null;
    }
  };

  return {
    trades,
    loading,
    createTrade,
    refetch: fetchTrades,
  };
}
