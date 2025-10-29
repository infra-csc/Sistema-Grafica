import { Bell, Package, CheckCircle, AlertTriangle, Truck, Clock, FileText } from "lucide-react";
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

interface NotificationBellProps {
  notifications: Array<{
    id: string;
    type: string;
    message: string;
    isRead: boolean;
    createdAt: Date | string;
  }>;
  onMarkAsRead: (id: string) => void;
}

// Função para obter ícone e cor baseado no tipo de notificação
function getNotificationStyle(type: string) {
  switch (type) {
    case "itemAdded":
      return {
        icon: Package,
        bgColor: "bg-blue-50",
        iconColor: "text-blue-600",
        borderColor: "border-l-blue-600",
      };
    case "arteApproved":
      return {
        icon: CheckCircle,
        bgColor: "bg-green-50",
        iconColor: "text-green-600",
        borderColor: "border-l-green-600",
      };
    case "deadlineAlert":
      return {
        icon: AlertTriangle,
        bgColor: "bg-red-50",
        iconColor: "text-red-600",
        borderColor: "border-l-red-600",
      };
    case "itemDelivered":
      return {
        icon: Truck,
        bgColor: "bg-purple-50",
        iconColor: "text-purple-600",
        borderColor: "border-l-purple-600",
      };
    case "eventCompleted":
      return {
        icon: CheckCircle,
        bgColor: "bg-green-50",
        iconColor: "text-green-600",
        borderColor: "border-l-green-600",
      };
    case "eventCreated":
      return {
        icon: FileText,
        bgColor: "bg-cyan-50",
        iconColor: "text-cyan-600",
        borderColor: "border-l-cyan-600",
      };
    default:
      return {
        icon: Bell,
        bgColor: "bg-gray-50",
        iconColor: "text-gray-600",
        borderColor: "border-l-gray-600",
      };
  }
}

export function NotificationBell({ notifications, onMarkAsRead }: NotificationBellProps) {
  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span 
              className="absolute -top-1 -right-1 h-4 w-4 flex items-center justify-center rounded-full bg-status-urgent text-white text-[10px] font-semibold"
              data-testid="badge-notification-count"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96">
        <DropdownMenuLabel>Notificações</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-96">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Nenhuma notificação
            </div>
          ) : (
            <div className="space-y-1">
              {notifications.map((notification) => {
                const style = getNotificationStyle(notification.type);
                const Icon = style.icon;
                
                return (
                  <div
                    key={notification.id}
                    className={`
                      relative mx-2 my-1 rounded-md border-l-4 ${style.borderColor}
                      ${!notification.isRead ? 'bg-accent/30' : 'bg-background'}
                      hover:bg-accent/50 cursor-pointer transition-colors
                    `}
                    onClick={() => !notification.isRead && onMarkAsRead(notification.id)}
                    data-testid={`notification-${notification.id}`}
                  >
                    <div className="flex gap-3 p-3">
                      <div className={`flex-shrink-0 mt-0.5 ${style.iconColor}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground leading-snug">
                          {notification.message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(notification.createdAt).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      {!notification.isRead && (
                        <div className="flex-shrink-0">
                          <div className="w-2 h-2 rounded-full bg-blue-600" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
