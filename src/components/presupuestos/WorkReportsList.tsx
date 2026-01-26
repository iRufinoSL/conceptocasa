import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, FileText, Search, BarChart3 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { WorkReportForm, type WorkReport } from './WorkReportForm';
import { WorkReportCard } from './WorkReportCard';
import { ProductivityReport } from './ProductivityReport';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface WorkReportsListProps {
  budgetId: string;
  isAdmin: boolean;
}

export function WorkReportsList({ budgetId, isAdmin }: WorkReportsListProps) {
  const [activeTab, setActiveTab] = useState<'partes' | 'productividad'>('partes');
  const [reports, setReports] = useState<WorkReport[]>([]);
  const [activities, setActivities] = useState<{ id: string; name: string; code: string; phase_code?: string | null }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingReport, setEditingReport] = useState<WorkReport | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchActivities = useCallback(async () => {
    const { data, error } = await supabase
      .from('budget_activities')
      .select('id, name, code, phase_id, budget_phases(code)')
      .eq('budget_id', budgetId)
      .order('code');

    if (error) {
      console.error('Error fetching activities:', error);
      return;
    }

    const mapped = (data || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      code: a.code,
      phase_code: a.budget_phases?.code || null,
    }));

    setActivities(mapped);
  }, [budgetId]);

  const fetchReports = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch work reports with workers
      const { data: reportsData, error: reportsError } = await supabase
        .from('work_reports')
        .select(`
          id,
          budget_id,
          title,
          report_date,
          created_by,
          created_at,
          updated_at
        `)
        .eq('budget_id', budgetId)
        .order('report_date', { ascending: false });

      if (reportsError) throw reportsError;

      // Fetch workers and entries for each report
      const reportsWithDetails: WorkReport[] = [];

      for (const report of reportsData || []) {
        // Fetch workers
        const { data: workersData } = await supabase
          .from('work_report_workers')
          .select('profile_id, hours_worked, hourly_rate_override, notes')
          .eq('work_report_id', report.id);

        // Fetch entries with images
        const { data: entriesData } = await supabase
          .from('work_report_entries')
          .select('id, description, activity_id')
          .eq('work_report_id', report.id)
          .order('created_at');

        // Fetch images for each entry
        const entriesWithImages = [];
        for (const entry of entriesData || []) {
          const { data: imagesData } = await supabase
            .from('work_report_entry_images')
            .select('id, file_name, file_path')
            .eq('entry_id', entry.id);

          entriesWithImages.push({
            ...entry,
            images: imagesData || [],
          });
        }

        reportsWithDetails.push({
          ...report,
          workers: workersData || [],
          entries: entriesWithImages,
        });
      }

      setReports(reportsWithDetails);
    } catch (error) {
      console.error('Error fetching work reports:', error);
      toast.error('Error al cargar los partes de trabajo');
    } finally {
      setIsLoading(false);
    }
  }, [budgetId]);

  useEffect(() => {
    fetchActivities();
    fetchReports();
  }, [fetchActivities, fetchReports]);

  const handleAddReport = () => {
    setEditingReport(null);
    setShowForm(true);
  };

  const handleEditReport = (report: WorkReport) => {
    setEditingReport(report);
    setShowForm(true);
  };

  const handleDeleteReport = async () => {
    if (!deleteId) return;

    try {
      // Delete will cascade to entries and images due to FK constraints
      // But we need to delete storage files manually
      const report = reports.find(r => r.id === deleteId);
      if (report?.entries) {
        for (const entry of report.entries) {
          if (entry.images) {
            const filePaths = entry.images.map(img => img.file_path);
            if (filePaths.length > 0) {
              await supabase.storage.from('resource-images').remove(filePaths);
            }
          }
        }
      }

      const { error } = await supabase
        .from('work_reports')
        .delete()
        .eq('id', deleteId);

      if (error) throw error;

      toast.success('Parte de trabajo eliminado');
      fetchReports();
    } catch (error) {
      console.error('Error deleting work report:', error);
      toast.error('Error al eliminar el parte de trabajo');
    } finally {
      setDeleteId(null);
    }
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingReport(null);
    fetchReports();
  };

  const filteredReports = reports.filter(report => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      report.title.toLowerCase().includes(q) ||
      report.entries?.some(e => e.description.toLowerCase().includes(q))
    );
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-40" />
        </div>
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tabs for Partes vs Productividad */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'partes' | 'productividad')}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="partes" className="flex items-center gap-1.5">
              <FileText className="h-4 w-4" />
              Partes ({reports.length})
            </TabsTrigger>
            <TabsTrigger value="productividad" className="flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4" />
              Productividad
            </TabsTrigger>
          </TabsList>

          {activeTab === 'partes' && (
            <div className="flex items-center gap-2">
              {reports.length > 0 && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar partes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-[200px]"
                  />
                </div>
              )}
              
              {isAdmin && (
                <Button onClick={handleAddReport}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Parte
                </Button>
              )}
            </div>
          )}
        </div>

        <TabsContent value="partes" className="mt-4">
          {/* Reports list */}
          {filteredReports.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  {reports.length === 0 
                    ? 'No hay partes de trabajo registrados'
                    : 'No se encontraron partes que coincidan con la búsqueda'
                  }
                </p>
                {isAdmin && reports.length === 0 && (
                  <Button onClick={handleAddReport} variant="outline" className="mt-4">
                    <Plus className="h-4 w-4 mr-2" />
                    Crear primer parte
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredReports.map(report => (
                <WorkReportCard
                  key={report.id}
                  report={report}
                  activities={activities}
                  onEdit={() => handleEditReport(report)}
                  onDelete={() => setDeleteId(report.id)}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="productividad" className="mt-4">
          <ProductivityReport budgetId={budgetId} />
        </TabsContent>
      </Tabs>

      {/* Form dialog */}
      <WorkReportForm
        budgetId={budgetId}
        activities={activities}
        report={editingReport}
        open={showForm}
        onOpenChange={setShowForm}
        onSuccess={handleFormSuccess}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar parte de trabajo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminarán todos los trabajos y fotografías asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteReport}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
