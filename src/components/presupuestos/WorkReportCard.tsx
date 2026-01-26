import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar, 
  Users, 
  FileText, 
  Pencil, 
  Trash2, 
  ChevronDown, 
  ChevronUp,
  Image as ImageIcon 
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { WorkReport } from './WorkReportForm';
import { formatActividadId } from '@/lib/activity-id';

interface WorkReportCardProps {
  report: WorkReport;
  activities: { id: string; name: string; code: string; phase_code?: string | null }[];
  onEdit: () => void;
  onDelete: () => void;
  isAdmin: boolean;
}

interface WorkerInfo {
  id: string;
  full_name: string | null;
  email: string | null;
}

export function WorkReportCard({ report, activities, onEdit, onDelete, isAdmin }: WorkReportCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);

  useEffect(() => {
    if (report.workers && report.workers.length > 0) {
      fetchWorkerDetails();
    }
  }, [report.workers]);

  const fetchWorkerDetails = async () => {
    const workerIds = report.workers?.map(w => w.profile_id) || [];
    if (workerIds.length === 0) return;

    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', workerIds);

    setWorkers(data || []);
  };

  const getActivityLabel = (activityId: string | null): string | null => {
    if (!activityId) return null;
    const activity = activities.find(a => a.id === activityId);
    if (!activity) return null;
    return formatActividadId({
      phaseCode: activity.phase_code,
      activityCode: activity.code,
      name: activity.name,
    });
  };

  const totalImages = (report.entries || []).reduce(
    (acc, entry) => acc + (entry.images?.length || 0), 
    0
  );

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-primary shrink-0" />
              <h4 className="font-medium truncate">{report.title}</h4>
            </div>
            
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {format(new Date(report.report_date), "d 'de' MMMM 'de' yyyy", { locale: es })}
              </span>
              
              {workers.length > 0 && (
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {workers.length} trabajador{workers.length !== 1 ? 'es' : ''}
                </span>
              )}
              
              {totalImages > 0 && (
                <span className="flex items-center gap-1">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {totalImages} foto{totalImages !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Workers badges */}
            {workers.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {workers.map(worker => (
                  <Badge key={worker.id} variant="secondary" className="text-xs">
                    {worker.full_name || worker.email || 'Usuario'}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="text-muted-foreground"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {(report.entries?.length || 0)} trabajo{report.entries?.length !== 1 ? 's' : ''}
            </Button>
            
            {isAdmin && (
              <>
                <Button variant="ghost" size="icon" onClick={onEdit}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={onDelete}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Expanded entries */}
        {expanded && report.entries && report.entries.length > 0 && (
          <div className="mt-4 pt-4 border-t space-y-3">
            {report.entries.map((entry, index) => (
              <div key={entry.id} className="pl-4 border-l-2 border-primary/30">
                <div className="text-sm font-medium mb-1">
                  Trabajo #{index + 1}
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  {entry.description}
                </p>
                
                {entry.activity_id && (
                  <Badge variant="outline" className="text-xs mb-2">
                    {getActivityLabel(entry.activity_id) || 'Actividad'}
                  </Badge>
                )}
                
                {entry.images && entry.images.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {entry.images.slice(0, 4).map((img) => (
                      <div 
                        key={img.id}
                        className="w-12 h-12 rounded border bg-muted flex items-center justify-center"
                      >
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      </div>
                    ))}
                    {entry.images.length > 4 && (
                      <div className="w-12 h-12 rounded border bg-muted flex items-center justify-center text-xs text-muted-foreground">
                        +{entry.images.length - 4}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
