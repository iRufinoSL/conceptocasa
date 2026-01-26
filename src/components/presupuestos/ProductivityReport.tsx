import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  BarChart3, 
  Clock, 
  Euro, 
  Users, 
  Calendar,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  FileText
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';

interface ProductivityReportProps {
  budgetId: string;
}

interface WorkerSummary {
  profileId: string;
  fullName: string | null;
  email: string | null;
  totalHours: number;
  totalCost: number;
  workDays: number;
  avgHoursPerDay: number;
  hourlyRate: number;
}

interface DailySummary {
  date: string;
  totalHours: number;
  totalCost: number;
  workerCount: number;
}

export function ProductivityReport({ budgetId }: ProductivityReportProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [workerSummaries, setWorkerSummaries] = useState<WorkerSummary[]>([]);
  const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const yearMonth = format(currentMonth, 'yyyy-MM');

  const fetchProductivityData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch all work reports for this budget in the selected month
      const { data: reports, error: reportsError } = await supabase
        .from('work_reports')
        .select(`
          id,
          report_date,
          work_report_workers (
            profile_id,
            hours_worked,
            hourly_rate_override
          )
        `)
        .eq('budget_id', budgetId)
        .gte('report_date', format(monthStart, 'yyyy-MM-dd'))
        .lte('report_date', format(monthEnd, 'yyyy-MM-dd'));

      if (reportsError) throw reportsError;

      // Get unique worker IDs
      const workerIds = new Set<string>();
      const workerHoursMap = new Map<string, { 
        hours: number; 
        cost: number; 
        days: Set<string>;
        rateSum: number;
        rateCount: number;
      }>();
      
      const dailyMap = new Map<string, { hours: number; cost: number; workers: Set<string> }>();

      for (const report of reports || []) {
        const date = report.report_date;
        
        if (!dailyMap.has(date)) {
          dailyMap.set(date, { hours: 0, cost: 0, workers: new Set() });
        }
        const dailyData = dailyMap.get(date)!;

        for (const worker of report.work_report_workers || []) {
          workerIds.add(worker.profile_id);
          
          const hours = worker.hours_worked || 0;
          const rate = worker.hourly_rate_override || 0;
          const cost = hours * rate;

          // Update worker summary
          if (!workerHoursMap.has(worker.profile_id)) {
            workerHoursMap.set(worker.profile_id, { 
              hours: 0, 
              cost: 0, 
              days: new Set(),
              rateSum: 0,
              rateCount: 0
            });
          }
          const workerData = workerHoursMap.get(worker.profile_id)!;
          workerData.hours += hours;
          workerData.cost += cost;
          workerData.days.add(date);
          if (rate > 0) {
            workerData.rateSum += rate;
            workerData.rateCount++;
          }

          // Update daily summary
          dailyData.hours += hours;
          dailyData.cost += cost;
          dailyData.workers.add(worker.profile_id);
        }
      }

      // Fetch worker profiles with default rates
      const workerIdsArray = Array.from(workerIds);
      let profiles: { id: string; full_name: string | null; email: string | null; hourly_rate: number }[] = [];
      
      if (workerIdsArray.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, email, hourly_rate')
          .in('id', workerIdsArray);
        profiles = profilesData || [];
      }

      // Build worker summaries
      const summaries: WorkerSummary[] = profiles.map(profile => {
        const data = workerHoursMap.get(profile.id);
        const avgRate = data?.rateCount ? data.rateSum / data.rateCount : profile.hourly_rate || 0;
        
        return {
          profileId: profile.id,
          fullName: profile.full_name,
          email: profile.email,
          totalHours: data?.hours || 0,
          totalCost: data?.cost || 0,
          workDays: data?.days.size || 0,
          avgHoursPerDay: data?.days.size ? (data.hours / data.days.size) : 0,
          hourlyRate: avgRate,
        };
      }).sort((a, b) => b.totalHours - a.totalHours);

      // Build daily summaries
      const dailies: DailySummary[] = Array.from(dailyMap.entries())
        .map(([date, data]) => ({
          date,
          totalHours: data.hours,
          totalCost: data.cost,
          workerCount: data.workers.size,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      setWorkerSummaries(summaries);
      setDailySummaries(dailies);
    } catch (error) {
      console.error('Error fetching productivity data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [budgetId, monthStart, monthEnd]);

  useEffect(() => {
    fetchProductivityData();
  }, [fetchProductivityData]);

  const totals = useMemo(() => {
    return workerSummaries.reduce(
      (acc, w) => ({
        hours: acc.hours + w.totalHours,
        cost: acc.cost + w.totalCost,
        days: acc.days + w.workDays,
      }),
      { hours: 0, cost: 0, days: 0 }
    );
  }, [workerSummaries]);

  const navigatePrevious = () => setCurrentMonth(subMonths(currentMonth, 1));
  const navigateNext = () => setCurrentMonth(addMonths(currentMonth, 1));
  const goToCurrentMonth = () => setCurrentMonth(new Date());

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-medium">Reporte de Productividad</h3>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={navigatePrevious}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToCurrentMonth}>
            Hoy
          </Button>
          <span className="text-sm font-medium min-w-[140px] text-center capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: es })}
          </span>
          <Button variant="outline" size="icon" onClick={navigateNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Clock className="h-4 w-4" />
              Total Horas
            </div>
            <div className="text-2xl font-bold mt-1">
              {totals.hours.toFixed(1)}h
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Euro className="h-4 w-4" />
              Coste Laboral
            </div>
            <div className="text-2xl font-bold mt-1">
              {totals.cost.toFixed(2)}€
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Users className="h-4 w-4" />
              Operarios
            </div>
            <div className="text-2xl font-bold mt-1">
              {workerSummaries.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Calendar className="h-4 w-4" />
              Días con trabajo
            </div>
            <div className="text-2xl font-bold mt-1">
              {dailySummaries.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Workers table */}
      {workerSummaries.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Resumen por Operario
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operario</TableHead>
                  <TableHead className="text-right">Horas</TableHead>
                  <TableHead className="text-right">Días</TableHead>
                  <TableHead className="text-right">Media/Día</TableHead>
                  <TableHead className="text-right">€/Hora</TableHead>
                  <TableHead className="text-right">Coste Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workerSummaries.map((worker) => (
                  <TableRow key={worker.profileId}>
                    <TableCell className="font-medium">
                      {worker.fullName || worker.email || 'Usuario'}
                    </TableCell>
                    <TableCell className="text-right">
                      {worker.totalHours.toFixed(1)}h
                    </TableCell>
                    <TableCell className="text-right">
                      {worker.workDays}
                    </TableCell>
                    <TableCell className="text-right">
                      {worker.avgHoursPerDay.toFixed(1)}h
                    </TableCell>
                    <TableCell className="text-right">
                      {worker.hourlyRate.toFixed(2)}€
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {worker.totalCost.toFixed(2)}€
                    </TableCell>
                  </TableRow>
                ))}
                {/* Totals row */}
                <TableRow className="bg-muted/50 font-medium">
                  <TableCell>TOTAL</TableCell>
                  <TableCell className="text-right">{totals.hours.toFixed(1)}h</TableCell>
                  <TableCell className="text-right">-</TableCell>
                  <TableCell className="text-right">-</TableCell>
                  <TableCell className="text-right">-</TableCell>
                  <TableCell className="text-right">{totals.cost.toFixed(2)}€</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              No hay datos de productividad para este mes
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Registra horas en los partes de trabajo para ver el reporte
            </p>
          </CardContent>
        </Card>
      )}

      {/* Daily breakdown */}
      {dailySummaries.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Desglose Diario
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {dailySummaries.map((day) => (
                <div
                  key={day.date}
                  className="p-3 border rounded-lg bg-muted/30 text-center"
                >
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(day.date), 'd MMM', { locale: es })}
                  </div>
                  <div className="font-medium mt-1">
                    {day.totalHours.toFixed(1)}h
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {day.workerCount} op. • {day.totalCost.toFixed(0)}€
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
