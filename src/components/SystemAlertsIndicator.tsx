import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bell, Home, Check } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface SystemAlert {
  id: string;
  alert_type: string;
  title: string;
  message: string | null;
  related_id: string | null;
  related_type: string | null;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
}

export function SystemAlertsIndicator() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const fetchAlerts = async () => {
    const { data, error } = await supabase
      .from('system_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (!error && data) {
      setAlerts(data);
      setUnreadCount(data.filter(a => !a.is_read).length);
    }
  };

  useEffect(() => {
    fetchAlerts();

    // Set up realtime subscription
    const channel = supabase
      .channel('system_alerts_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'system_alerts'
        },
        () => {
          fetchAlerts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleAlertClick = async (alert: SystemAlert) => {
    // Mark as read
    if (!alert.is_read) {
      await supabase
        .from('system_alerts')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', alert.id);
      
      fetchAlerts();
    }

    // Navigate to action URL
    if (alert.action_url) {
      setIsOpen(false);
      navigate(alert.action_url);
    }
  };

  const markAllAsRead = async () => {
    await supabase
      .from('system_alerts')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('is_read', false);
    
    fetchAlerts();
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'new_project_profile':
        return <Home className="h-4 w-4 text-primary" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  if (alerts.length === 0) {
    return null;
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs animate-pulse"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="font-semibold text-sm">Alertas del Sistema</span>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead} className="h-7 text-xs">
              <Check className="h-3 w-3 mr-1" />
              Marcar todo leído
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {alerts.map((alert) => (
            <DropdownMenuItem
              key={alert.id}
              onClick={() => handleAlertClick(alert)}
              className={`flex items-start gap-3 p-3 cursor-pointer ${
                !alert.is_read ? 'bg-primary/5' : ''
              }`}
            >
              <div className="mt-0.5">
                {getAlertIcon(alert.alert_type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${!alert.is_read ? 'text-primary' : ''}`}>
                    {alert.title}
                  </span>
                  {!alert.is_read && (
                    <span className="h-2 w-2 rounded-full bg-destructive flex-shrink-0" />
                  )}
                </div>
                {alert.message && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {alert.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(alert.created_at), "d MMM, HH:mm", { locale: es })}
                </p>
              </div>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
