import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { FolderOpen, ClipboardList, Building2, FileText, X, Check, Plus } from 'lucide-react';

interface CommunicationActionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communicationId: string;
  communicationType: 'email' | 'whatsapp';
  communicationSubject?: string | null;
  communicationContent?: string;
  contactId?: string | null;
  contactName?: string;
  // Current assignments
  currentBudgetIds?: string[];
  currentProjectIds?: string[];
}

export function CommunicationActionsDialog({
  open,
  onOpenChange,
  communicationId,
  communicationType,
  communicationSubject,
  communicationContent,
  contactId,
  contactName,
  currentBudgetIds = [],
  currentProjectIds = [],
}: CommunicationActionsDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'assign' | 'task'>('assign');
  
  // Assignment state
  const [selectedBudgets, setSelectedBudgets] = useState<string[]>(currentBudgetIds);
  const [selectedProjects, setSelectedProjects] = useState<string[]>(currentProjectIds);
  
  // Task state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskType, setTaskType] = useState('Tarea');
  const [taskDate, setTaskDate] = useState('');
  const [taskStartTime, setTaskStartTime] = useState('');
  const [taskEndTime, setTaskEndTime] = useState('');

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedBudgets(currentBudgetIds);
      setSelectedProjects(currentProjectIds);
      setTaskTitle(communicationSubject ? `Seguimiento: ${communicationSubject}` : `Seguimiento: ${contactName || 'Comunicación'}`);
      setTaskDescription(communicationContent?.replace(/<[^>]*>/g, '').substring(0, 500) || '');
      setTaskDate('');
      setTaskStartTime('');
      setTaskEndTime('');
    }
  }, [open, currentBudgetIds, currentProjectIds, communicationSubject, communicationContent, contactName]);

  // Fetch budgets
  const { data: budgets = [] } = useQuery({
    queryKey: ['budgets-for-assignment'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select('id, nombre, codigo_correlativo, version')
        .order('nombre', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Fetch projects
  const { data: projects = [] } = useQuery({
    queryKey: ['projects-for-assignment'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, project_number')
        .order('name', { ascending: true });
      if (error) throw error;
      return data as Array<{ id: string; name: string; project_number: number | null }>;
    },
    enabled: open,
  });

  // Save assignments mutation
  const saveAssignmentsMutation = useMutation({
    mutationFn: async () => {
      if (communicationType === 'email') {
        // Delete existing budget assignments and add new ones
        await supabase
          .from('email_budget_assignments')
          .delete()
          .eq('email_id', communicationId);
        
        if (selectedBudgets.length > 0) {
          await supabase
            .from('email_budget_assignments')
            .insert(selectedBudgets.map(budgetId => ({
              email_id: communicationId,
              budget_id: budgetId,
            })));
        }

        // Delete existing project assignments and add new ones
        await supabase
          .from('email_project_assignments')
          .delete()
          .eq('email_id', communicationId);
        
        if (selectedProjects.length > 0) {
          await supabase
            .from('email_project_assignments')
            .insert(selectedProjects.map(projectId => ({
              email_id: communicationId,
              project_id: projectId,
            })));
        }
      } else {
        // WhatsApp assignments
        await supabase
          .from('whatsapp_budget_assignments')
          .delete()
          .eq('message_id', communicationId);
        
        if (selectedBudgets.length > 0) {
          await supabase
            .from('whatsapp_budget_assignments')
            .insert(selectedBudgets.map(budgetId => ({
              message_id: communicationId,
              budget_id: budgetId,
            })));
        }

        await supabase
          .from('whatsapp_project_assignments')
          .delete()
          .eq('message_id', communicationId);
        
        if (selectedProjects.length > 0) {
          await supabase
            .from('whatsapp_project_assignments')
            .insert(selectedProjects.map(projectId => ({
              message_id: communicationId,
              project_id: projectId,
            })));
        }
      }
    },
    onSuccess: () => {
      toast({ title: 'Asignaciones guardadas' });
      queryClient.invalidateQueries({ queryKey: ['unified-emails'] });
      queryClient.invalidateQueries({ queryKey: ['unified-whatsapp'] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: async () => {
      const { data: newManagement, error } = await supabase
        .from('crm_managements')
        .insert({
          title: taskTitle.trim(),
          description: taskDescription.trim() || null,
          management_type: taskType,
          status: 'Pendiente',
          target_date: taskDate || null,
          start_time: taskStartTime || null,
          end_time: taskEndTime || null,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Link contact if available
      if (contactId && newManagement) {
        await supabase
          .from('crm_management_contacts')
          .insert({
            management_id: newManagement.id,
            contact_id: contactId,
          });
      }

      return newManagement;
    },
    onSuccess: () => {
      toast({ title: 'Tarea creada correctamente' });
      queryClient.invalidateQueries({ queryKey: ['crm-managements'] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const toggleBudget = (budgetId: string) => {
    setSelectedBudgets(prev => 
      prev.includes(budgetId) 
        ? prev.filter(id => id !== budgetId)
        : [...prev, budgetId]
    );
  };

  const toggleProject = (projectId: string) => {
    setSelectedProjects(prev => 
      prev.includes(projectId) 
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    );
  };

  const handleSaveAssignments = () => {
    saveAssignmentsMutation.mutate();
  };

  const handleCreateTask = () => {
    if (!taskTitle.trim()) {
      toast({ title: 'Error', description: 'El título es obligatorio', variant: 'destructive' });
      return;
    }
    createTaskMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Acciones de Comunicación
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'assign' | 'task')} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="assign" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Asociar a Presupuesto/Proyecto
            </TabsTrigger>
            <TabsTrigger value="task" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Crear Tarea
            </TabsTrigger>
          </TabsList>

          <TabsContent value="assign" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Budgets */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Presupuestos
                </Label>
                <div className="flex flex-wrap gap-1 min-h-[32px]">
                  {selectedBudgets.map(id => {
                    const budget = budgets.find(b => b.id === id);
                    return budget ? (
                      <Badge 
                        key={id} 
                        variant="secondary" 
                        className="cursor-pointer"
                        onClick={() => toggleBudget(id)}
                      >
                        {budget.codigo_correlativo.toString().padStart(4, '0')} - {budget.nombre}
                        <X className="h-3 w-3 ml-1" />
                      </Badge>
                    ) : null;
                  })}
                </div>
                <ScrollArea className="h-48 border rounded-md p-2">
                  <div className="space-y-1">
                    {budgets.map(budget => (
                      <div 
                        key={budget.id}
                        className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                          selectedBudgets.includes(budget.id) 
                            ? 'bg-primary/10 border border-primary/30' 
                            : 'hover:bg-accent'
                        }`}
                        onClick={() => toggleBudget(budget.id)}
                      >
                        <Checkbox 
                          checked={selectedBudgets.includes(budget.id)} 
                          onCheckedChange={() => toggleBudget(budget.id)}
                        />
                        <span className="text-sm flex-1 truncate">
                          {budget.codigo_correlativo.toString().padStart(4, '0')} - {budget.nombre} ({budget.version})
                        </span>
                      </div>
                    ))}
                    {budgets.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No hay presupuestos disponibles
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Projects */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Proyectos
                </Label>
                <div className="flex flex-wrap gap-1 min-h-[32px]">
                  {selectedProjects.map(id => {
                    const project = projects.find(p => p.id === id);
                    return project ? (
                      <Badge 
                        key={id} 
                        variant="secondary" 
                        className="cursor-pointer"
                        onClick={() => toggleProject(id)}
                      >
                        {project.project_number ? `${project.project_number} - ` : ''}{project.name}
                        <X className="h-3 w-3 ml-1" />
                      </Badge>
                    ) : null;
                  })}
                </div>
                <ScrollArea className="h-48 border rounded-md p-2">
                  <div className="space-y-1">
                    {projects.map(project => (
                      <div 
                        key={project.id}
                        className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                          selectedProjects.includes(project.id) 
                            ? 'bg-primary/10 border border-primary/30' 
                            : 'hover:bg-accent'
                        }`}
                        onClick={() => toggleProject(project.id)}
                      >
                        <Checkbox 
                          checked={selectedProjects.includes(project.id)} 
                          onCheckedChange={() => toggleProject(project.id)}
                        />
                        <span className="text-sm flex-1 truncate">
                          {project.project_number ? `${project.project_number} - ` : ''}{project.name}
                        </span>
                      </div>
                    ))}
                    {projects.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No hay proyectos disponibles
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleSaveAssignments} 
                disabled={saveAssignmentsMutation.isPending}
              >
                <Check className="h-4 w-4 mr-2" />
                {saveAssignmentsMutation.isPending ? 'Guardando...' : 'Guardar Asignaciones'}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="task" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="taskTitle">Título de la Tarea *</Label>
                <Input
                  id="taskTitle"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Título de la tarea"
                  maxLength={200}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="taskType">Tipo</Label>
                  <Select value={taskType} onValueChange={setTaskType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Tarea">Tarea</SelectItem>
                      <SelectItem value="Reunión">Reunión</SelectItem>
                      <SelectItem value="Llamada">Llamada</SelectItem>
                      <SelectItem value="Email">Email</SelectItem>
                      <SelectItem value="Visita">Visita</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taskDate">Fecha</Label>
                  <Input
                    id="taskDate"
                    type="date"
                    value={taskDate}
                    onChange={(e) => setTaskDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="taskStartTime">Hora inicio</Label>
                  <Input
                    id="taskStartTime"
                    type="time"
                    value={taskStartTime}
                    onChange={(e) => setTaskStartTime(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taskEndTime">Hora fin</Label>
                  <Input
                    id="taskEndTime"
                    type="time"
                    value={taskEndTime}
                    onChange={(e) => setTaskEndTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="taskDescription">Descripción</Label>
                <Textarea
                  id="taskDescription"
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  placeholder="Descripción de la tarea..."
                  rows={4}
                  maxLength={1000}
                />
              </div>

              {contactName && (
                <div className="flex items-center gap-2 p-2 bg-accent/50 rounded-md">
                  <span className="text-sm text-muted-foreground">Contacto asociado:</span>
                  <Badge variant="secondary">{contactName}</Badge>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleCreateTask} 
                disabled={createTaskMutation.isPending}
              >
                <Plus className="h-4 w-4 mr-2" />
                {createTaskMutation.isPending ? 'Creando...' : 'Crear Tarea'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
