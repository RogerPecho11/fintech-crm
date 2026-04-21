import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Webhook, CheckCircle, XCircle, Eye } from 'lucide-react';
import api from '../lib/api';
import { timeAgo } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const WEBHOOK_EVENTS = [
  'merchant.created', 'merchant.updated', 'merchant.status_changed',
  'document.uploaded', 'task.completed', 'comment.added',
];

export default function WebhooksPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', url: '', secret: '', events: [] as string[] });

  const { data: webhooks } = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => api.get('/webhooks').then(r => r.data),
  });

  const { data: logs } = useQuery({
    queryKey: ['webhook-logs', selectedWebhook],
    queryFn: () => api.get(`/webhooks/${selectedWebhook}/logs`).then(r => r.data),
    enabled: !!selectedWebhook,
  });

  const createWebhook = useMutation({
    mutationFn: (data: any) => api.post('/webhooks', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      setShowModal(false);
      setForm({ name: '', url: '', secret: '', events: [] });
      toast.success('Webhook creado');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error'),
  });

  const toggleWebhook = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.put(`/webhooks/${id}`, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhooks'] }),
  });

  const deleteWebhook = useMutation({
    mutationFn: (id: string) => api.delete(`/webhooks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success('Webhook eliminado');
    },
  });

  const toggleEvent = (event: string) => {
    setForm(f => ({
      ...f,
      events: f.events.includes(event) ? f.events.filter(e => e !== event) : [...f.events, event],
    }));
  };

  if (user?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400">
        <Webhook className="w-12 h-12 mb-3 opacity-30" />
        <p>Acceso restringido a administradores</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
          <p className="text-gray-500 text-sm mt-1">Integraciones y notificaciones externas</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Nuevo Webhook
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          {(webhooks || []).map((wh: any) => (
            <div key={wh.id} className={`card p-4 ${selectedWebhook === wh.id ? 'border-rose-300' : ''}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 text-sm">{wh.name}</p>
                    <span className={`badge text-xs ${wh.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                      {wh.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 font-mono mt-1 truncate">{wh.url}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(wh.events || []).map((e: string) => (
                      <span key={e} className="badge bg-gray-100 text-gray-500 text-xs">{e}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    <span>{wh.total_calls || 0} llamadas</span>
                    <span className="text-emerald-600">{wh.successful_calls || 0} exitosas</span>
                  </div>
                </div>
                <div className="flex gap-2 ml-3">
                  <button
                    onClick={() => setSelectedWebhook(selectedWebhook === wh.id ? null : wh.id)}
                    className="text-gray-400 transition-colors"
                    style={selectedWebhook === wh.id ? { color: '#FC2B5F' } : undefined}
                    title="Ver logs"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggleWebhook.mutate({ id: wh.id, is_active: !wh.is_active })}
                    className={`transition-colors ${wh.is_active ? 'text-emerald-500 hover:text-red-400' : 'text-gray-400 hover:text-emerald-500'}`}
                  >
                    {wh.is_active ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  </button>
                  <button onClick={() => deleteWebhook.mutate(wh.id)} className="text-gray-400 hover:text-red-400 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {(!webhooks || webhooks.length === 0) && (
            <div className="card text-center py-12 text-gray-400">
              <Webhook className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No hay webhooks configurados</p>
            </div>
          )}
        </div>

        {selectedWebhook && (
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-3 text-sm">Logs del Webhook</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {(logs || []).map((log: any) => (
                <div key={log.id} className={`p-2 rounded-lg text-xs ${log.success ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <div className="flex items-center justify-between">
                    <span className={log.success ? 'text-emerald-600' : 'text-red-500'}>
                      {log.success ? '✓' : '✗'} {log.event}
                    </span>
                    <span className="text-gray-500">{log.response_status}</span>
                  </div>
                  <p className="text-gray-400 mt-0.5">{timeAgo(log.attempted_at)}</p>
                </div>
              ))}
              {(!logs || logs.length === 0) && <p className="text-gray-400 text-center py-4">Sin logs</p>}
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Nuevo Webhook</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div><label className="label">Nombre *</label><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><label className="label">URL *</label><input type="url" className="input" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://..." /></div>
              <div><label className="label">Secret (para firma HMAC)</label><input className="input" value={form.secret} onChange={e => setForm(f => ({ ...f, secret: e.target.value }))} placeholder="Opcional" /></div>
              <div>
                <label className="label">Eventos *</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {WEBHOOK_EVENTS.map(event => (
                    <label key={event} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.events.includes(event)} onChange={() => toggleEvent(event)} className="w-3.5 h-3.5 rounded border-gray-300" />
                      <span className="text-xs text-gray-700">{event}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={() => createWebhook.mutate(form)} disabled={!form.name || !form.url || form.events.length === 0 || createWebhook.isPending} className="btn-primary flex-1">
                Crear Webhook
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
