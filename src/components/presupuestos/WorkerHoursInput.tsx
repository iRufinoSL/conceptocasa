import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Clock, Euro } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface WorkerWithHours {
  profile_id: string;
  hours_worked: number;
  hourly_rate_override: number | null;
  notes: string | null;
  profile?: {
    full_name: string | null;
    email: string | null;
    hourly_rate: number;
  };
}

interface WorkerHoursInputProps {
  selectedWorkers: string[];
  workersWithHours: Map<string, { hours: number; rate: number | null; notes: string }>;
  onWorkersHoursChange: (data: Map<string, { hours: number; rate: number | null; notes: string }>) => void;
}

interface WorkerInfo {
  id: string;
  full_name: string | null;
  email: string | null;
  hourly_rate: number;
}

export function WorkerHoursInput({ 
  selectedWorkers, 
  workersWithHours, 
  onWorkersHoursChange 
}: WorkerHoursInputProps) {
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (selectedWorkers.length > 0) {
      fetchWorkerDetails();
    } else {
      setWorkers([]);
      setIsLoading(false);
    }
  }, [selectedWorkers]);

  const fetchWorkerDetails = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, hourly_rate')
        .in('id', selectedWorkers);

      if (error) throw error;
      setWorkers(data || []);
    } catch (error) {
      console.error('Error fetching worker details:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateWorkerData = (
    workerId: string, 
    field: 'hours' | 'rate' | 'notes', 
    value: number | string | null
  ) => {
    const current = workersWithHours.get(workerId) || { hours: 0, rate: null, notes: '' };
    const updated = new Map(workersWithHours);
    
    if (field === 'hours') {
      updated.set(workerId, { ...current, hours: value as number });
    } else if (field === 'rate') {
      updated.set(workerId, { ...current, rate: value as number | null });
    } else {
      updated.set(workerId, { ...current, notes: value as string });
    }
    
    onWorkersHoursChange(updated);
  };

  const getWorkerData = (workerId: string) => {
    return workersWithHours.get(workerId) || { hours: 0, rate: null, notes: '' };
  };

  const getEffectiveRate = (worker: WorkerInfo): number => {
    const data = getWorkerData(worker.id);
    return data.rate ?? worker.hourly_rate ?? 0;
  };

  const calculateCost = (worker: WorkerInfo): number => {
    const data = getWorkerData(worker.id);
    const rate = getEffectiveRate(worker);
    return data.hours * rate;
  };

  const totalHours = workers.reduce((sum, w) => sum + getWorkerData(w.id).hours, 0);
  const totalCost = workers.reduce((sum, w) => sum + calculateCost(w), 0);

  if (selectedWorkers.length === 0) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Label className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Horas trabajadas por operario
        </Label>
        {[1, 2].map(i => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Label className="flex items-center gap-2 text-base font-medium">
        <Clock className="h-4 w-4" />
        Horas trabajadas por operario
      </Label>

      <div className="space-y-3">
        {workers.map(worker => {
          const data = getWorkerData(worker.id);
          const effectiveRate = getEffectiveRate(worker);
          const cost = calculateCost(worker);

          return (
            <div 
              key={worker.id} 
              className="p-3 border rounded-lg bg-muted/30 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {worker.full_name || worker.email || 'Usuario'}
                </span>
                <Badge variant="outline" className="flex items-center gap-1">
                  <Euro className="h-3 w-3" />
                  {cost.toFixed(2)}
                </Badge>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Horas</Label>
                  <Input
                    type="number"
                    min="0"
                    max="24"
                    step="0.5"
                    value={data.hours || ''}
                    onChange={(e) => updateWorkerData(
                      worker.id, 
                      'hours', 
                      parseFloat(e.target.value) || 0
                    )}
                    placeholder="0"
                    className="h-9"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    €/hora {worker.hourly_rate > 0 && `(def: ${worker.hourly_rate})`}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={data.rate ?? ''}
                    onChange={(e) => updateWorkerData(
                      worker.id, 
                      'rate', 
                      e.target.value ? parseFloat(e.target.value) : null
                    )}
                    placeholder={worker.hourly_rate?.toString() || '0'}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1 col-span-2 md:col-span-1">
                  <Label className="text-xs text-muted-foreground">Notas</Label>
                  <Input
                    value={data.notes || ''}
                    onChange={(e) => updateWorkerData(worker.id, 'notes', e.target.value)}
                    placeholder="Notas opcionales..."
                    className="h-9"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Totals */}
      {workers.length > 0 && (
        <div className="flex items-center justify-end gap-4 pt-2 border-t">
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Total horas:</span>
            <span className="font-medium">{totalHours.toFixed(1)}h</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Euro className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Coste total:</span>
            <span className="font-medium">{totalCost.toFixed(2)}€</span>
          </div>
        </div>
      )}
    </div>
  );
}
