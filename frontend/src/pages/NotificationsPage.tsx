import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Trash2, AlertTriangle, Clock, FileText, MessageSquare, CheckSquare } from 'lucide-react';
import api from '../lib/api';
import { Notification, NotificationType } from '../types';
import { timeAgo } from '../lib/utils';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

const TYPE_ICONS: Record<NotificationType, any> = {
  inactivity_alert: AlertTriangle,
  status_change: CheckSquare,
  task_due: Clock,
  document_required: FileText,
  comment_mention: MessageSquare,
  task_assigned: CheckSquare,
  general: Bell,
};

const TYPE_COLORS: Record<NotificationType, string> = {
  inactivity_alert: 'text-orange-500 bg-orange-50',
  status_change: 'text-blue-500 bg-blue-50',
  task_due: 'text-red-500 bg-red-50',
  document_required: 'text-yellow-500 bg-yellow-50',
  comment_mention: 'text-purple-500 bg-purple-50',
  task_assigned: 'text-green-500 bg-green-50',
  general: 'text-gray-500 bg-gray-100',
};

export default function NotificationsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'all'],
    queryFn: () => api.get('/notifications?limit=50').then(r => r.data),
    refetchInterval: 30000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('Todas marcadas como leídas');
    },
  });

  const deleteNotif = useMutation({
    mutationFn: (id: string) => api.delete(`/notifications/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const notifications: Notification[] = data?.data || [];
  const unreadCount = data?.unreadCount || 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notificaciones</h1>
          <p className="text-gray-500 text-sm mt-1">
            {unreadCount > 0 ? `${unreadCount} sin leer` : 'Todo al día'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button onClick={() => markAllRead.mutate()} className="btn-secondary flex items-center gap-2 text-sm">
            <CheckCheck className="w-4 h-4" />
            Marcar todas
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: '#F0184A', borderTopColor: 'transparent' }} />
        </div>
      ) : notifications.length === 0 ? (
        <div className="card text-center py-16">
          <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No hay notificaciones</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => {
            const Icon = TYPE_ICONS[n.type] || Bell;
            const colorClass = TYPE_COLORS[n.type] || TYPE_COLORS.general;
            return (
              <div
                key={n.id}
                className={`card p-4 flex items-start gap-4 cursor-pointer transition-colors ${!n.is_read ? 'border-rose-200' : ''}`}
                onClick={() => !n.is_read && markRead.mutate(n.id)}
              >
                <div className={`p-2 rounded-lg flex-shrink-0 ${colorClass}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-medium ${!n.is_read ? 'text-gray-900' : 'text-gray-700'}`}>
                      {n.title}
                    </p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {!n.is_read && (
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#F0184A' }} />
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteNotif.mutate(n.id); }}
                        className="text-gray-300 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-gray-400">{timeAgo(n.created_at)}</span>
                    {n.merchant_id && n.merchant_name && (
                      <Link
                        to={`/merchants/${n.merchant_id}`}
                        onClick={e => e.stopPropagation()}
                        className="text-xs hover:underline"
                        style={{ color: '#F0184A' }}
                      >
                        {n.merchant_name}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
