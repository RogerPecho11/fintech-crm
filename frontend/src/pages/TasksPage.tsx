import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, CheckSquare, Clock, AlertCircle, X, Trash2, Upload } from 'lucide-react';
import api from '../lib/api';
import { Task, PRIORITY_COLORS } from '../types';
import { formatDateTime, timeAgo } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useSlaStatus } from '../lib/hooks/useSlaStatus';
import SlaIndicator from '../components/SlaIndicator';
import toast from 'react-hot-toast';

export default function TasksPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: slaData } = useSlaStatus();
  const [filter, setFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', priority: 'medium', due_date: '', assigned_to: '', merchant_id: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', filter],
    queryFn: () => api.get('/tasks', { params: { status: filter || undefined, limit: 50 } }).then(r => r.data),
  });

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
  });

  const createTask = useMutation({
    mutationFn: (data: any) => api.post('/tasks', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setShowModal(false);
      setForm({ title: '', description: '', priority: 'medium', due_date: '', assigned_to: '', merchant_id: '' });
      toast.success('Tarea creada');
    },
  });

  const updateTask = useMutation({
    mutationFn: ({ id, ...data }: any) => api.put(`/tasks/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const tasks: Task[] = data?.data || [];

  const grouped = {
    pending: tasks.filter(t => t.status === 'pending'),
    in_progress: tasks.filter(t => t.status === 'in_progress'),
    completed: tasks.filter(t => t.status === 'completed'),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tareas</h1>
          <p className="text-gray-500 text-sm mt-1">{tasks.length} tareas</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Nueva Tarea
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {[
          { val: '', label: 'Todas' },
          { val: 'pending', label: 'Pendientes' },
          { val: 'in_progress', label: 'En Progreso' },
          { val: 'completed', label: 'Completadas' },
        ].map(f => (
          <button
            key={f.val}
            onClick={() => setFilter(f.val)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f.val ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            style={filter === f.val ? { backgroundColor: '#FC2B5F', color: 'white' } : undefined}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: '#FC2B5F', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Pending */}
          <TaskColumn
            title="Pendientes"
            tasks={grouped.pending}
            color="text-yellow-500"
            icon={Clock}
            slaData={slaData?.tasks}
            onStatusChange={(id, status) => updateTask.mutate({ id, status })}
          />
          {/* In Progress */}
          <TaskColumn
            title="En Progreso"
            tasks={grouped.in_progress}
            color="text-blue-500"
            icon={AlertCircle}
            slaData={slaData?.tasks}
            onStatusChange={(id, status) => updateTask.mutate({ id, status })}
          />
          {/* Completed */}
          <TaskColumn
            title="Completadas"
            tasks={grouped.completed}
            color="text-emerald-500"
            icon={CheckSquare}
            slaData={slaData?.tasks}
            onStatusChange={(id, status) => updateTask.mutate({ id, status })}
          />
        </div>
      )}

      {/* Create Task Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Nueva Tarea</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">Título *</label>
                <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="label">Descripción</label>
                <textarea className="input h-20 resize-none" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Prioridad</label>
                  <select className="input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </div>
                <div>
                  <label className="label">Fecha límite</label>
                  <input type="datetime-local" className="input" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Asignar a</label>
                <select className="input" value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}>
                  <option value="">Sin asignar</option>
                  {(users || []).map((u: any) => (
                    <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button
                onClick={() => createTask.mutate(form)}
                disabled={!form.title || createTask.isPending}
                className="btn-primary flex-1"
              >
                Crear Tarea
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskColumn({ title, tasks, color, icon: Icon, slaData, onStatusChange }: any) {
  const queryClient = useQueryClient();
  const [completeModal, setCompleteModal] = useState<string | null>(null);
  const [closeComment, setCloseComment] = useState('');
  const [closeImage, setCloseImage] = useState<File | null>(null);
  const [completing, setCompleting] = useState(false);

  const handleComplete = async (taskId: string) => {
    setCompleting(true);
    try {
      // Si hay imagen, subirla primero
      if (closeImage) {
        const task = tasks.find((t: Task) => t.id === taskId);
        if (task?.merchant_id) {
          const formData = new FormData();
          formData.append('file', closeImage);
          formData.append('merchant_id', task.merchant_id);
          formData.append('document_type', 'evidence');
          formData.append('description', `Evidencia cierre tarea: ${task.title}${closeComment ? ' - ' + closeComment : ''}`);
          formData.append('name', `Evidencia - ${task.title}`);
          await api.post('/documents/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        }
      }
      // Actualizar tarea con comentario y status completed
      await api.put(`/tasks/${taskId}`, {
        status: 'completed',
        description: closeComment ? `${tasks.find((t: Task) => t.id === taskId)?.description || ''}\n\n📝 Comentario de cierre: ${closeComment}` : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Tarea completada');
      setCompleteModal(null);
      setCloseComment('');
      setCloseImage(null);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al completar tarea');
    } finally {
      setCompleting(false);
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm('¿Eliminar esta tarea? Esta acción es irreversible.')) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Tarea eliminada');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al eliminar');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <h3 className={`font-semibold text-sm ${color}`}>{title}</h3>
        <span className="ml-auto text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{tasks.length}</span>
      </div>
      {tasks.map((task: Task) => (
        <div key={task.id} className="card p-3 space-y-2 bg-white border border-gray-200">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-gray-900">{task.title}</p>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <SlaIndicator result={slaData?.[task.id]} />
              <span className={`badge text-xs ${PRIORITY_COLORS[task.priority]}`}>{task.priority}</span>
            </div>
          </div>
          {task.description && <p className="text-xs text-gray-500 whitespace-pre-line">{task.description}</p>}
          {task.merchant_name && (
            <p className="text-xs" style={{ color: '#FC2B5F' }}>{task.merchant_name}</p>
          )}
          <div className="flex items-center justify-between">
            {task.due_date && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDateTime(task.due_date)}
              </span>
            )}
            {task.assigned_to_name && (
              <span className="text-xs text-gray-500">{task.assigned_to_name}</span>
            )}
          </div>
          <div className="flex gap-1 pt-1 border-t border-gray-100 items-center">
            {task.status !== 'in_progress' && task.status !== 'completed' && (
              <button
                onClick={() => onStatusChange(task.id, 'in_progress')}
                className="text-xs text-blue-500 hover:text-blue-600 transition-colors"
              >
                Iniciar
              </button>
            )}
            {task.status !== 'completed' && (
              <button
                onClick={() => setCompleteModal(task.id)}
                className="text-xs text-emerald-500 hover:text-emerald-600 transition-colors ml-auto"
              >
                Completar
              </button>
            )}
            <button
              onClick={() => handleDelete(task.id)}
              className="p-1 rounded text-gray-300 hover:text-red-500 transition-colors ml-1"
              title="Eliminar tarea"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
      {tasks.length === 0 && (
        <div className="text-center py-6 text-gray-400 text-sm">Sin tareas</div>
      )}

      {/* Modal completar tarea */}
      {completeModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">Completar Tarea</h3>
              <button onClick={() => { setCompleteModal(null); setCloseComment(''); setCloseImage(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Comentario de cierre</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-200 h-24 resize-none"
                  value={closeComment}
                  onChange={e => setCloseComment(e.target.value)}
                  placeholder="Describe el resultado o resolución de la tarea..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Imagen / Evidencia (opcional)</label>
                <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
                  <input type="file" accept="image/*,.pdf" className="hidden" id={`close-img-${completeModal}`}
                    onChange={e => setCloseImage(e.target.files?.[0] || null)} />
                  <label htmlFor={`close-img-${completeModal}`} className="cursor-pointer flex items-center justify-center gap-2">
                    <Upload className="w-5 h-5 text-gray-400" />
                    <span className="text-sm text-gray-600">{closeImage?.name || 'Click para subir archivo'}</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setCompleteModal(null); setCloseComment(''); setCloseImage(null); }} className="btn-secondary flex-1">Cancelar</button>
                <button
                  onClick={() => handleComplete(completeModal)}
                  disabled={completing}
                  className="flex-1 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                  style={{ background: '#FC2B5F' }}
                >
                  {completing ? 'Guardando...' : 'Completar Tarea'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
