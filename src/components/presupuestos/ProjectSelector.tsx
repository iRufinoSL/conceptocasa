import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, ChevronDown, X } from 'lucide-react';
import { toast } from 'sonner';

interface Project {
  id: string;
  name: string;
  status: string;
}

interface ProjectSelectorProps {
  currentProject: Project | null;
  presupuestoId: string;
  isAdmin: boolean;
  onProjectChanged: (project: Project | null) => void;
}

export function ProjectSelector({ currentProject, presupuestoId, isAdmin, onProjectChanged }: ProjectSelectorProps) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchProjects();
    }
  }, [open]);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, status')
        .order('name');
      if (error) throw error;
      setProjects(data || []);
    } catch {
      toast.error('Error al cargar proyectos');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (projectId: string) => {
    try {
      const { error } = await supabase
        .from('presupuestos')
        .update({ project_id: projectId })
        .eq('id', presupuestoId);
      if (error) throw error;
      const selected = projects.find(p => p.id === projectId) || null;
      onProjectChanged(selected);
      toast.success('Proyecto asociado actualizado');
      setOpen(false);
    } catch {
      toast.error('Error al actualizar proyecto');
    }
  };

  const handleClear = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase
        .from('presupuestos')
        .update({ project_id: null })
        .eq('id', presupuestoId);
      if (error) throw error;
      onProjectChanged(null);
      toast.success('Proyecto desvinculado');
    } catch {
      toast.error('Error al desvincular proyecto');
    }
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Proyecto</CardDescription>
          <CardTitle className="text-2xl">{currentProject?.name || 'Sin proyecto'}</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>Proyecto</CardDescription>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className="h-auto p-0 text-2xl font-semibold justify-start hover:bg-transparent hover:text-primary"
            >
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <span className="truncate">{currentProject?.name || 'Sin proyecto'}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                {currentProject && (
                  <span
                    onClick={handleClear}
                    className="ml-1 text-muted-foreground hover:text-destructive cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </span>
                )}
              </div>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar proyecto..." />
              <CommandList className="max-h-[250px]">
                <CommandEmpty>{loading ? 'Cargando...' : 'No se encontraron proyectos'}</CommandEmpty>
                <CommandGroup>
                  {projects.map(p => (
                    <CommandItem
                      key={p.id}
                      value={p.name}
                      onSelect={() => handleSelect(p.id)}
                      className="flex items-center justify-between"
                    >
                      <span className="truncate">{p.name}</span>
                      {p.id === currentProject?.id && (
                        <Badge variant="secondary" className="text-[10px] ml-2">Actual</Badge>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </CardHeader>
    </Card>
  );
}
