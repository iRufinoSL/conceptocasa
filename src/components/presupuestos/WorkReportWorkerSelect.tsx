import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown, X, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface Worker {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface WorkReportWorkerSelectProps {
  selectedWorkers: string[];
  onWorkersChange: (workerIds: string[]) => void;
}

export function WorkReportWorkerSelect({ selectedWorkers, onWorkersChange }: WorkReportWorkerSelectProps) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchWorkers();
  }, []);

  const fetchWorkers = async () => {
    setIsLoading(true);
    try {
      // Fetch profiles that have administrador or colaborador roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['administrador', 'colaborador']);

      if (rolesError) throw rolesError;

      const userIds = [...new Set((rolesData || []).map(r => r.user_id))];

      if (userIds.length === 0) {
        setWorkers([]);
        setIsLoading(false);
        return;
      }

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)
        .order('full_name');

      if (profilesError) throw profilesError;

      setWorkers(profilesData || []);
    } catch (error) {
      console.error('Error fetching workers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredWorkers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return workers;
    return workers.filter(w => 
      (w.full_name?.toLowerCase().includes(q)) ||
      (w.email?.toLowerCase().includes(q))
    );
  }, [workers, searchQuery]);

  const toggleWorker = (workerId: string) => {
    if (selectedWorkers.includes(workerId)) {
      onWorkersChange(selectedWorkers.filter(id => id !== workerId));
    } else {
      onWorkersChange([...selectedWorkers, workerId]);
    }
  };

  const removeWorker = (workerId: string) => {
    onWorkersChange(selectedWorkers.filter(id => id !== workerId));
  };

  const getWorkerName = (workerId: string): string => {
    const worker = workers.find(w => w.id === workerId);
    return worker?.full_name || worker?.email || 'Usuario';
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Label>Trabajadores</Label>
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <Users className="h-4 w-4" />
        Trabajadores que han participado
      </Label>

      {/* Selected workers badges */}
      {selectedWorkers.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedWorkers.map(workerId => (
            <Badge 
              key={workerId} 
              variant="secondary"
              className="flex items-center gap-1"
            >
              {getWorkerName(workerId)}
              <button
                type="button"
                onClick={() => removeWorker(workerId)}
                className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Worker selector */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
            type="button"
          >
            <span className="text-muted-foreground">
              {selectedWorkers.length === 0
                ? 'Seleccionar trabajadores...'
                : `${selectedWorkers.length} trabajador(es) seleccionado(s)`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar trabajador..."
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList className="max-h-[240px]">
              <CommandEmpty>No se encontraron trabajadores.</CommandEmpty>
              <CommandGroup>
                {filteredWorkers.map(worker => (
                  <CommandItem
                    key={worker.id}
                    value={worker.id}
                    onSelect={() => toggleWorker(worker.id)}
                    className="cursor-pointer"
                  >
                    <Check 
                      className={`mr-2 h-4 w-4 ${
                        selectedWorkers.includes(worker.id) ? 'opacity-100' : 'opacity-0'
                      }`} 
                    />
                    <div className="flex flex-col">
                      <span>{worker.full_name || 'Sin nombre'}</span>
                      {worker.email && (
                        <span className="text-xs text-muted-foreground">{worker.email}</span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
