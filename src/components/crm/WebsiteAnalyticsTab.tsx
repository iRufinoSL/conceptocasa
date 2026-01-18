import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Eye, MousePointer, FileText, Globe, Smartphone, Monitor, TrendingUp, Users } from "lucide-react";

interface WebsiteEvent {
  id: string;
  session_id: string;
  event_type: string;
  page_path: string;
  page_title: string;
  referrer: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  user_agent: string;
  screen_width: number;
  created_at: string;
}

interface AnalyticsSummary {
  totalVisits: number;
  uniqueSessions: number;
  pageViews: number;
  formSubmissions: number;
  topSources: { name: string; count: number }[];
  topPages: { path: string; views: number }[];
  deviceBreakdown: { device: string; count: number }[];
  dailyVisits: { date: string; visits: number }[];
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const WebsiteAnalyticsTab = () => {
  const [dateRange, setDateRange] = useState("7");
  const [events, setEvents] = useState<WebsiteEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsSummary>({
    totalVisits: 0,
    uniqueSessions: 0,
    pageViews: 0,
    formSubmissions: 0,
    topSources: [],
    topPages: [],
    deviceBreakdown: [],
    dailyVisits: [],
  });

  useEffect(() => {
    fetchEvents();
  }, [dateRange]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const startDate = startOfDay(subDays(new Date(), parseInt(dateRange)));
      
      const { data, error } = await supabase
        .from('website_events')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      const typedData = (data || []) as WebsiteEvent[];
      setEvents(typedData);
      calculateAnalytics(typedData);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateAnalytics = (data: WebsiteEvent[]) => {
    // Unique sessions
    const uniqueSessions = new Set(data.map(e => e.session_id)).size;

    // Page views
    const pageViews = data.filter(e => e.event_type === 'page_view').length;

    // Form submissions
    const formSubmissions = data.filter(e => e.event_type === 'form_submit').length;

    // Top sources
    const sourceCounts: Record<string, number> = {};
    data.forEach(e => {
      const source = e.utm_source || e.referrer || 'Directo';
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    });
    const topSources = Object.entries(sourceCounts)
      .map(([name, count]) => ({ name: name.substring(0, 20), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Top pages
    const pageCounts: Record<string, number> = {};
    data.filter(e => e.event_type === 'page_view').forEach(e => {
      const path = e.page_path || '/';
      pageCounts[path] = (pageCounts[path] || 0) + 1;
    });
    const topPages = Object.entries(pageCounts)
      .map(([path, views]) => ({ path, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);

    // Device breakdown
    const deviceCounts: Record<string, number> = {};
    data.forEach(e => {
      let device = 'Escritorio';
      if (e.screen_width) {
        if (e.screen_width < 768) device = 'Móvil';
        else if (e.screen_width < 1024) device = 'Tablet';
      }
      deviceCounts[device] = (deviceCounts[device] || 0) + 1;
    });
    const deviceBreakdown = Object.entries(deviceCounts)
      .map(([device, count]) => ({ device, count }));

    // Daily visits
    const dailyCounts: Record<string, number> = {};
    data.forEach(e => {
      const day = format(new Date(e.created_at), 'yyyy-MM-dd');
      dailyCounts[day] = (dailyCounts[day] || 0) + 1;
    });
    const dailyVisits = Object.entries(dailyCounts)
      .map(([date, visits]) => ({ 
        date: format(new Date(date), 'dd MMM', { locale: es }), 
        visits 
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    setAnalytics({
      totalVisits: data.length,
      uniqueSessions,
      pageViews,
      formSubmissions,
      topSources,
      topPages,
      deviceBreakdown,
      dailyVisits,
    });
  };

  const getDeviceIcon = (device: string) => {
    switch (device) {
      case 'Móvil': return <Smartphone className="h-4 w-4" />;
      case 'Tablet': return <Monitor className="h-4 w-4" />;
      default: return <Monitor className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Analíticas Web</h2>
          <p className="text-muted-foreground">Métricas de visitas y conversiones</p>
        </div>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 días</SelectItem>
            <SelectItem value="14">Últimos 14 días</SelectItem>
            <SelectItem value="30">Últimos 30 días</SelectItem>
            <SelectItem value="90">Últimos 90 días</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/10">
                <Eye className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Páginas vistas</p>
                <p className="text-2xl font-bold">{analytics.pageViews}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-chart-2/10">
                <Users className="h-6 w-6 text-chart-2" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Sesiones únicas</p>
                <p className="text-2xl font-bold">{analytics.uniqueSessions}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-chart-3/10">
                <FileText className="h-6 w-6 text-chart-3" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Formularios enviados</p>
                <p className="text-2xl font-bold">{analytics.formSubmissions}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-chart-4/10">
                <TrendingUp className="h-6 w-6 text-chart-4" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Conversión</p>
                <p className="text-2xl font-bold">
                  {analytics.uniqueSessions > 0 
                    ? ((analytics.formSubmissions / analytics.uniqueSessions) * 100).toFixed(1) 
                    : 0}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Visits Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Visitas por día</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.dailyVisits.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={analytics.dailyVisits}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))' 
                    }} 
                  />
                  <Bar dataKey="visits" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                No hay datos para el período seleccionado
              </div>
            )}
          </CardContent>
        </Card>

        {/* Device Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dispositivos</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.deviceBreakdown.length > 0 ? (
              <div className="flex items-center gap-8">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={analytics.deviceBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="count"
                      nameKey="device"
                    >
                      {analytics.deviceBreakdown.map((entry, index) => (
                        <Cell key={entry.device} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3">
                  {analytics.deviceBreakdown.map((item, index) => (
                    <div key={item.device} className="flex items-center gap-3">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <div className="flex items-center gap-2">
                        {getDeviceIcon(item.device)}
                        <span className="text-sm">{item.device}</span>
                      </div>
                      <Badge variant="secondary">{item.count}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                No hay datos
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tables Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Sources */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Fuentes de tráfico
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.topSources.length > 0 ? (
              <div className="space-y-3">
                {analytics.topSources.map((source, index) => (
                  <div key={source.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-muted-foreground">{index + 1}.</span>
                      <span className="text-sm">{source.name}</span>
                    </div>
                    <Badge variant="outline">{source.count} visitas</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">No hay datos</p>
            )}
          </CardContent>
        </Card>

        {/* Top Pages */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Páginas más visitadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.topPages.length > 0 ? (
              <div className="space-y-3">
                {analytics.topPages.map((page, index) => (
                  <div key={page.path} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-muted-foreground">{index + 1}.</span>
                      <span className="text-sm font-mono">{page.path}</span>
                    </div>
                    <Badge variant="outline">{page.views} vistas</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">No hay datos</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Events */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MousePointer className="h-5 w-5" />
            Eventos recientes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {events.slice(0, 20).map((event) => (
                <div 
                  key={event.id} 
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <Badge 
                      variant={event.event_type === 'form_submit' ? 'default' : 'secondary'}
                      className="min-w-24 justify-center"
                    >
                      {event.event_type}
                    </Badge>
                    <span className="text-sm">{event.page_path}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {event.utm_source && (
                      <span className="text-xs bg-muted px-2 py-1 rounded">
                        {event.utm_source}
                      </span>
                    )}
                    <span>
                      {format(new Date(event.created_at), "dd MMM HH:mm", { locale: es })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No hay eventos registrados</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WebsiteAnalyticsTab;
