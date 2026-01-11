import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { TaskCard } from './TaskCard';
import type { BudgetTask } from './BudgetAgendaTab';

interface TaskListViewProps {
  tasks: BudgetTask[];
  onEdit: (task: BudgetTask) => void;
  onDelete: (taskId: string) => void;
  onToggleStatus: (task: BudgetTask) => void;
  isAdmin: boolean;
}

export function TaskListView({ tasks, onEdit, onDelete, onToggleStatus, isAdmin }: TaskListViewProps) {
  // Group tasks by activity
  const tasksByActivity = tasks.reduce((acc, task) => {
    const activityKey = task.activity?.id || 'sin-actividad';
    const activityName = task.activity 
      ? `${task.activity.code} - ${task.activity.name}` 
      : 'Sin actividad';
    
    if (!acc[activityKey]) {
      acc[activityKey] = {
        name: activityName,
        tasks: []
      };
    }
    acc[activityKey].tasks.push(task);
    return acc;
  }, {} as Record<string, { name: string; tasks: BudgetTask[] }>);

  // Calculate end date for display
  const getEndDateDisplay = (task: BudgetTask): string | null => {
    if (!task.start_date) return null;
    const endDate = addDays(new Date(task.start_date), (task.duration_days || 1) - 1);
    return format(endDate, 'd MMM yyyy', { locale: es });
  };

  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            No hay tareas que mostrar
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {Object.entries(tasksByActivity).map(([activityId, { name, tasks: activityTasks }]) => (
        <Card key={activityId}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activityTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onEdit={() => onEdit(task)}
                  onDelete={() => onDelete(task.id)}
                  onToggleStatus={() => onToggleStatus(task)}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
