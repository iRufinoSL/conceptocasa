import { Bell, Mail, Ticket, Check, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useNotifications, Notification } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const getNotificationIcon = (type: Notification["type"]) => {
  switch (type) {
    case "email":
      return <Mail className="h-4 w-4" />;
    case "ticket":
      return <Ticket className="h-4 w-4" />;
    default:
      return <Bell className="h-4 w-4" />;
  }
};

const getNotificationColor = (type: Notification["type"]) => {
  switch (type) {
    case "error":
      return "text-destructive";
    case "warning":
      return "text-yellow-600";
    case "success":
      return "text-green-600";
    case "email":
      return "text-blue-600";
    case "ticket":
      return "text-purple-600";
    default:
      return "text-muted-foreground";
  }
};

// Safe navigation helper - only allows internal URLs
const isInternalUrl = (url: string): boolean => {
  // Allow relative URLs starting with /
  if (url.startsWith('/')) {
    return true;
  }
  
  // Check if it's a same-origin URL
  try {
    const parsedUrl = new URL(url, window.location.origin);
    return parsedUrl.origin === window.location.origin;
  } catch {
    return false;
  }
};

export function NotificationsDropdown() {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notificaciones</span>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 text-xs"
              onClick={(e) => {
                e.preventDefault();
                markAllAsRead();
              }}
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Marcar todas
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-[300px]">
          {loading ? (
            <div className="p-4 text-center text-muted-foreground">
              Cargando...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              No hay notificaciones
            </div>
          ) : (
            notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={cn(
                  "flex flex-col items-start gap-1 p-3 cursor-pointer",
                  !notification.read && "bg-accent/50"
                )}
                onClick={() => {
                  if (!notification.read) {
                    markAsRead(notification.id);
                  }
                  // Navigate if action_url exists - only allow internal URLs for security
                  if (notification.action_url) {
                    if (isInternalUrl(notification.action_url)) {
                      // Use React Router for internal navigation
                      if (notification.action_url.startsWith('/')) {
                        navigate(notification.action_url);
                      } else {
                        window.location.href = notification.action_url;
                      }
                    } else {
                      console.warn('Blocked external redirect attempt:', notification.action_url);
                      toast.error('URL de notificación no válida');
                    }
                  }
                }}
              >
                <div className="flex items-center gap-2 w-full">
                  <span className={getNotificationColor(notification.type)}>
                    {getNotificationIcon(notification.type)}
                  </span>
                  <span className="font-medium flex-1 truncate">
                    {notification.title}
                  </span>
                  {!notification.read && (
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-line">
                  {notification.message}
                </p>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(notification.created_at), { 
                    addSuffix: true,
                    locale: es 
                  })}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
