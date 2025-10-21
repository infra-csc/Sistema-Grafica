import { Bell } from "lucide-react";
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
    message: string;
    isRead: boolean;
    createdAt: Date | string;
  }>;
  onMarkAsRead: (id: string) => void;
}

export function NotificationBell({ notifications, onMarkAsRead }: NotificationBellProps) {
  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-status-urgent text-white text-xs"
              data-testid="badge-notification-count"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notificações</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-72">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Nenhuma notificação
            </div>
          ) : (
            notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={`p-4 cursor-pointer ${!notification.isRead ? 'bg-accent/50' : ''}`}
                onClick={() => !notification.isRead && onMarkAsRead(notification.id)}
                data-testid={`notification-${notification.id}`}
              >
                <div className="flex flex-col gap-1 w-full">
                  <p className="text-sm">{notification.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(notification.createdAt).toLocaleString('pt-BR')}
                  </p>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
