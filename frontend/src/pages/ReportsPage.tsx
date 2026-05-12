import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend, RadialBarChart, RadialBar
} from 'recharts';
import { Download, FileSpreadsheet, Filter, Loader2, CheckSquare, Users } from 'lucide-react';
import api from '../lib/api';
import { STATUS_LABELS } from '../types';
import { getStatuses, useConfigRefresh } from '../lib/config';
import { scoreColor } from '../lib/utils';
import toast from 'react-hot-toast';

const TOOLTIP_STYLE = {
  contentStyle: { background: '#fff', border: '1px solid #E5E7EB', borderRadius: '10px' },
  labelStyle: { color: '#374151', fontWeight: 600 },
};

const STATUS_COLORS_TASK: Record<string, string> = {
  completed:   '#10B981',
  in_progress: '#3B82F6',
  pending:     '#F59E0B',
  cancelled:   '#EF4444',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#EF4444',
  high:   '#F97316',
  medium: '#3B82F6',
  low:    '#9CA3AF',
};

export default function ReportsPage() {
  useConfigRefresh();
  const statuses = getStatuses();
  const [filters, setFilters] = useState({
    status: '', risk_level: '', date_from: '', date_to: '', onboarding_assigned_to: '',
  });
  const [exporting, setExporting] = useState<string | null>(null);

  // Fetch onboarding users for filter
  const { data: onboardingUsers } = useQuery({
    queryKey: ['users-onboarding'],
    queryFn: () => api.get('/users').then(r => (r.data || []).filter((u: any) => u.role === 'onboarding' || u.role === 'admin')),
  });

  // Task report filters
  const [taskFilters, setTaskFilters] = useState({
    role: '', date_from: '', date_to: '', status: '',
  });
  const [exportingTask, setExportingTask] = useState<string | null>(null);

  const { data: summary } = useQuery({
    queryKey: ['reports', 'summary'],
    queryFn: () => api.get('/reports/summary').then(r => r.data),
  });

  const { data: merchants, isLoading } = useQuery({
    queryKey: ['reports', 'merchants', filters],
    queryFn: () => api.get('/reports/merchants', { params: filters }).then(r => r.data),
  });

  const handleExport = async (format: string) => {
    setExporting(format);
    const toastId = toast.loading(`Generando ${format.toUpperCase()}...`);
    try {
      const mimeTypes: Record<string, string> = {
        csv:   'text/csv',
        excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        pdf:   'application/pdf',
      };
      const extensions: Record<string, string> = {
        csv: 'csv', excel: 'xlsx', pdf: 'pdf',
      };

      const response = await api.get('/reports/merchants', {
        params: { ...filters, format },
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: mimeTypes[format] });
      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href     = url;
      link.download = `comercios_${new Date().toISOString().slice(0,10)}.${extensions[format]}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`${format.toUpperCase()} descargado`, { id: toastId });
    } catch (err) {
      toast.error(`Error al exportar ${format.toUpperCase()}`, { id: toastId });
    } finally {
      setExporting(null);
    }
  };

  const set = (field: string, value: string) => setFilters(f => ({ ...f, [field]: value }));

  // ── Task report ────────────────────────────────────────────────────────────
  const { data: taskReport, isLoading: taskLoading } = useQuery({
    queryKey: ['reports', 'tasks', taskFilters],
    queryFn: () => api.get('/reports/tasks', { params: taskFilters }).then(r => r.data),
  });

  const setTask = (field: string, value: string) =>
    setTaskFilters(f => ({ ...f, [field]: value }));

  const handleExportTasks = async (format: 'excel' | 'pdf') => {
    setExportingTask(format);
    const toastId = toast.loading(`Generando ${format.toUpperCase()}...`);
    try {
      const mimeTypes = {
        excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        pdf:   'application/pdf',
      };
      const response = await api.get('/reports/tasks', {
        params: { ...taskFilters, format },
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: mimeTypes[format] });
      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href     = url;
      link.download = `tareas_${new Date().toISOString().slice(0, 10)}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} descargado`, { id: toastId });
    } catch {
      toast.error(`Error al exportar`, { id: toastId });
    } finally {
      setExportingTask(null);
    }
  };

  // Chart data for tasks
  const taskSummary: any[] = taskReport?.summary || [];
  const taskStatusChart = taskSummary.map(u => ({
    name: u.user_name.split(' ')[0],
    Completadas:  Number(u.completed   || 0),
    'En Progreso':Number(u.in_progress || 0),
    Pendientes:   Number(u.pending     || 0),
    Canceladas:   Number(u.cancelled   || 0),
  }));
  const completionPieData = taskSummary
    .filter(u => Number(u.total) > 0)
    .map(u => ({
      name: u.user_name.split(' ')[0],
      value: Number(u.completion_rate || 0),
    }));
  const PIE_COLORS = ['#FC2B5F','#3b82f6','#10b981','#f59e0b','#8b5cf6','#06b6d4','#f97316'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
        <p className="text-gray-500 text-sm mt-1">Análisis y exportación de datos</p>
      </div>

      {/* Summary Charts */}
      {summary && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card bg-white">
            <h3 className="font-semibold text-gray-900 mb-4">Comercios por Estado</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={summary.statusSummary}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="status" tickFormatter={(v) => statuses.find(s => s.value === v)?.label || v} tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                  formatter={(v: any, n: any) => [v, n === 'count' ? 'Comercios' : n]}
                />
                <Bar dataKey="count" name="Comercios" radius={[4, 4, 0, 0]} fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card bg-white">
            <h3 className="font-semibold text-gray-900 mb-4">Top MCC Codes</h3>
            <div className="space-y-2">
              {(summary.mccSummary || []).slice(0, 8).map((item: any, i: number) => (
                <div key={item.mcc_code} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-gray-400 w-12">{item.mcc_code}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-gray-500 truncate">{item.mcc_description || 'N/A'}</span>
                      <span className="text-xs text-gray-900 font-medium ml-2">{item.count}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1">
                      <div
                        className="h-1 rounded-full"
                        style={{ width: `${(item.count / (summary.mccSummary[0]?.count || 1)) * 100}%`, backgroundColor: '#FC2B5F' }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card bg-white">
            <h3 className="font-semibold text-gray-900 mb-4">Crecimiento Mensual</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={summary.monthlyGrowth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
                <Bar dataKey="new_merchants" name="Nuevos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="certified" name="Certificados" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

        </div>
      )}

      {/* Export Section */}
      <div className="card bg-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Exportar Datos</h3>
          <div className="flex gap-2">
            <button
              onClick={() => handleExport('csv')}
              disabled={!!exporting}
              className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50"
            >
              {exporting === 'csv'
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Download className="w-4 h-4" />}
              CSV
            </button>
            <button
              onClick={() => handleExport('excel')}
              disabled={!!exporting}
              className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50"
            >
              {exporting === 'excel'
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <FileSpreadsheet className="w-4 h-4" />}
              Excel
            </button>
            <button
              onClick={() => handleExport('pdf')}
              disabled={!!exporting}
              className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50"
            >
              {exporting === 'pdf'
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Download className="w-4 h-4" />}
              PDF
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
          <Filter className="w-4 h-4 text-gray-400 mt-2" />
          <select className="input w-auto text-sm" value={filters.status} onChange={e => set('status', e.target.value)}>
            <option value="">Todos los estados</option>
            {statuses.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select className="input w-auto text-sm" value={filters.risk_level} onChange={e => set('risk_level', e.target.value)}>
            <option value="">Todos los riesgos</option>
            <option value="low">Bajo</option>
            <option value="medium">Medio</option>
            <option value="high">Alto</option>
            <option value="critical">Crítico</option>
          </select>
          <select className="input w-auto text-sm" value={filters.onboarding_assigned_to} onChange={e => set('onboarding_assigned_to', e.target.value)}>
            <option value="">Todos los técnicos Onboarding</option>
            {(onboardingUsers || []).map((u: any) => (
              <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
            ))}
          </select>
          <input type="date" className="input w-auto text-sm" value={filters.date_from} onChange={e => set('date_from', e.target.value)} placeholder="Desde" />
          <input type="date" className="input w-auto text-sm" value={filters.date_to} onChange={e => set('date_to', e.target.value)} placeholder="Hasta" />
        </div>

        {/* Preview table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="table-header">Comercio</th>
                <th className="table-header">Tax ID</th>
                <th className="table-header">Estado</th>
                <th className="table-header">MCC</th>
                <th className="table-header">Score</th>
                <th className="table-header">País</th>
                <th className="table-header">Resp. Onboarding</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Cargando...</td></tr>
              ) : (merchants?.data || []).slice(0, 10).map((m: any) => {
                const statusLabel = statuses.find(s => s.value === m.status)?.label || m.status || '';
                const showPopup = m.merchant_id && (statusLabel.toLowerCase().includes('acta') || m.status === 'finalizado' || statusLabel.toLowerCase().includes('finalizado'));
                return (
                <tr key={m.id} className="border-b border-gray-100">
                  <td className="table-cell font-medium text-gray-900">
                    {showPopup
                      ? <MerchantHoverCell name={m.legal_name} merchantId={m.merchant_id} />
                      : m.legal_name
                    }
                  </td>
                  <td className="table-cell font-mono text-xs">{m.tax_id}</td>
                  <td className="table-cell">{statuses.find(s => s.value === m.status)?.label || m.status}</td>
                  <td className="table-cell font-mono text-xs">{m.mcc_code}</td>
                  <td className="table-cell">{m.score}</td>
                  <td className="table-cell">{m.country}</td>
                  <td className="table-cell text-xs text-gray-500">{m.onboarding_assigned_to_name || '—'}</td>
                </tr>
              ); })}
            </tbody>
          </table>
          {merchants?.total > 10 && (
            <p className="text-xs text-gray-400 text-center py-2">
              Mostrando 10 de {merchants.total} registros. Exporta para ver todos.
            </p>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          REPORTE DE TAREAS POR USUARIO
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="card">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <CheckSquare className="w-5 h-5 flex-shrink-0" style={{ color: '#FC2B5F' }} />
            <h2 className="text-lg font-bold text-gray-900">Tareas por Usuario</h2>
            {taskReport && (
              <span className="badge bg-gray-100 text-gray-500 text-xs">
                {taskReport.total} tareas
              </span>
            )}
          </div>

          {/* Export buttons */}
          <button
            onClick={() => handleExportTasks('excel')}
            disabled={!!exportingTask}
            className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50"
          >
            {exportingTask === 'excel'
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <FileSpreadsheet className="w-4 h-4" />}
            Excel
          </button>
          <button
            onClick={() => handleExportTasks('pdf')}
            disabled={!!exportingTask}
            className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50"
          >
            {exportingTask === 'pdf'
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Download className="w-4 h-4" />}
            PDF
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-5 p-3 bg-gray-50 rounded-xl border border-gray-100">
          <Filter className="w-4 h-4 text-gray-400 mt-2 flex-shrink-0" />

          <select className="input w-auto text-sm" value={taskFilters.role}
            onChange={e => setTask('role', e.target.value)}>
            <option value="">Todos los roles</option>
            <option value="admin">Administrador</option>
            <option value="commercial">Comercial</option>
            <option value="onboarding">Onboarding</option>
          </select>

          <select className="input w-auto text-sm" value={taskFilters.status}
            onChange={e => setTask('status', e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="completed">Completadas</option>
            <option value="in_progress">En Progreso</option>
            <option value="pending">Pendientes</option>
            <option value="cancelled">Canceladas</option>
          </select>

          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500 whitespace-nowrap">Desde</label>
            <input type="date" className="input w-auto text-sm" value={taskFilters.date_from}
              onChange={e => setTask('date_from', e.target.value)} />
          </div>

          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500 whitespace-nowrap">Hasta</label>
            <input type="date" className="input w-auto text-sm" value={taskFilters.date_to}
              onChange={e => setTask('date_to', e.target.value)} />
          </div>

          {(taskFilters.role || taskFilters.status || taskFilters.date_from || taskFilters.date_to) && (
            <button
              onClick={() => setTaskFilters({ role: '', date_from: '', date_to: '', status: '' })}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>

        {taskLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: '#FC2B5F', borderTopColor: 'transparent' }} />
          </div>
        ) : (
          <>
            {/* ── Gráficos ── */}
            {taskSummary.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

                {/* Tareas por usuario (stacked bar) */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    Tareas por Usuario y Estado
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={taskStatusChart} margin={{ left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                      <XAxis dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                      <Tooltip {...TOOLTIP_STYLE} />
                      <Legend />
                      <Bar dataKey="Completadas"   stackId="a" fill={STATUS_COLORS_TASK.completed}   radius={[0,0,0,0]} />
                      <Bar dataKey="En Progreso"   stackId="a" fill={STATUS_COLORS_TASK.in_progress} />
                      <Bar dataKey="Pendientes"    stackId="a" fill={STATUS_COLORS_TASK.pending} />
                      <Bar dataKey="Canceladas"    stackId="a" fill={STATUS_COLORS_TASK.cancelled}   radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* % Completado por usuario (pie) */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    % de Completado por Usuario
                  </h3>
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="55%" height={200}>
                      <PieChart>
                        <Pie
                          data={completionPieData}
                          cx="50%" cy="50%"
                          innerRadius={45} outerRadius={75}
                          paddingAngle={2} dataKey="value"
                        >
                          {completionPieData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          {...TOOLTIP_STYLE}
                          formatter={(v: any) => [v + '%', 'Completado']}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-1.5">
                      {completionPieData.map((item, i) => (
                        <div key={item.name} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <span className="text-gray-600 truncate">{item.name}</span>
                          </div>
                          <span className="font-semibold text-gray-900 ml-2">{item.value}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Tabla resumen ── */}
            {taskSummary.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-400" />
                  Resumen por Usuario
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="table-header">Usuario</th>
                        <th className="table-header">Rol</th>
                        <th className="table-header text-right">Total</th>
                        <th className="table-header text-right">✅ Completadas</th>
                        <th className="table-header text-right">🔵 En Progreso</th>
                        <th className="table-header text-right">🟡 Pendientes</th>
                        <th className="table-header text-right">🔴 Canceladas</th>
                        <th className="table-header text-right">% Completado</th>
                        <th className="table-header text-right">Hrs Prom.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taskSummary.map((u: any) => (
                        <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="table-cell font-medium text-gray-900">{u.user_name}</td>
                          <td className="table-cell">
                            <span className={`badge text-xs ${
                              u.role === 'admin'      ? 'bg-purple-50 text-purple-600' :
                              u.role === 'onboarding' ? 'bg-green-50 text-green-600' :
                                                        'bg-blue-50 text-blue-600'
                            }`}>
                              {u.role === 'admin' ? 'Admin' : u.role === 'onboarding' ? 'Onboarding' : 'Comercial'}
                            </span>
                          </td>
                          <td className="table-cell text-right font-semibold text-gray-900">{u.total}</td>
                          <td className="table-cell text-right text-emerald-600 font-medium">{u.completed}</td>
                          <td className="table-cell text-right text-blue-600">{u.in_progress}</td>
                          <td className="table-cell text-right text-yellow-600">{u.pending}</td>
                          <td className="table-cell text-right text-red-500">{u.cancelled}</td>
                          <td className="table-cell text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-gray-100 rounded-full h-1.5">
                                <div className="h-1.5 rounded-full bg-emerald-500"
                                  style={{ width: `${Math.min(100, Number(u.completion_rate || 0))}%` }} />
                              </div>
                              <span className={`font-semibold text-xs ${scoreColor(Number(u.completion_rate || 0))}`}>
                                {u.completion_rate || 0}%
                              </span>
                            </div>
                          </td>
                          <td className="table-cell text-right text-gray-500">
                            {u.avg_hours_to_complete ? u.avg_hours_to_complete + 'h' : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Detalle de tareas ── */}
            {taskReport?.tasks?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Detalle de Tareas
                  <span className="text-gray-400 font-normal ml-2">
                    (mostrando {Math.min(50, taskReport.tasks.length)} de {taskReport.tasks.length})
                  </span>
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="table-header">Usuario</th>
                        <th className="table-header">Tarea</th>
                        <th className="table-header">Estado</th>
                        <th className="table-header">Prioridad</th>
                        <th className="table-header">Comercio</th>
                        <th className="table-header">Creada</th>
                        <th className="table-header">Completada</th>
                        <th className="table-header">Puntualidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taskReport.tasks.slice(0, 50).map((t: any) => (
                        <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="table-cell text-gray-700">{t.user_name}</td>
                          <td className="table-cell font-medium text-gray-900 max-w-xs truncate">{t.title}</td>
                          <td className="table-cell">
                            <span className="badge text-xs font-medium"
                              style={{ backgroundColor: (STATUS_COLORS_TASK[t.status] || '#9CA3AF') + '20',
                                       color: STATUS_COLORS_TASK[t.status] || '#9CA3AF' }}>
                              {t.status === 'completed' ? 'Completada' :
                               t.status === 'in_progress' ? 'En Progreso' :
                               t.status === 'pending' ? 'Pendiente' : 'Cancelada'}
                            </span>
                          </td>
                          <td className="table-cell">
                            <span className="badge text-xs"
                              style={{ backgroundColor: (PRIORITY_COLORS[t.priority] || '#9CA3AF') + '20',
                                       color: PRIORITY_COLORS[t.priority] || '#9CA3AF' }}>
                              {t.priority}
                            </span>
                          </td>
                          <td className="table-cell text-xs text-gray-500 truncate max-w-[120px]">
                            {t.merchant_name || '—'}
                          </td>
                          <td className="table-cell text-xs text-gray-500">
                            {t.created_at ? new Date(t.created_at).toLocaleDateString('es-PE') : '—'}
                          </td>
                          <td className="table-cell text-xs text-gray-500">
                            {t.completed_at ? new Date(t.completed_at).toLocaleDateString('es-PE') : '—'}
                          </td>
                          <td className="table-cell text-xs">
                            {t.timeliness === 'on_time'    && <span className="text-emerald-600 font-medium">✓ A tiempo</span>}
                            {t.timeliness === 'late'       && <span className="text-red-500 font-medium">✗ Tarde</span>}
                            {t.timeliness === 'overdue'    && <span className="text-orange-500 font-medium">⚠ Vencida</span>}
                            {t.timeliness === 'no_deadline'&& <span className="text-gray-400">— Sin fecha</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(!taskReport?.tasks?.length) && (
              <div className="text-center py-10 text-gray-400">
                <CheckSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No hay tareas para los filtros seleccionados.</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Monitoreo de Transacciones ─────────────────────────────────────────── */}
      <MonitoringSection />
    </div>
  );
}

// ─── Hover popup para comercios con "Acta de entrega" ─────────────────────────
function MerchantHoverCell({ name, merchantId }: { name: string; merchantId: string }) {
  const [show, setShow] = useState(false);
  const timeoutRef = useRef<any>(null);

  const { data } = useQuery({
    queryKey: ['quick-summary', merchantId],
    queryFn: () => api.get(`/transactions/quick-summary/${merchantId}`).then(r => r.data),
    enabled: show,
    staleTime: 60000,
  });

  const handleEnter = () => {
    timeoutRef.current = setTimeout(() => setShow(true), 300);
  };
  const handleLeave = () => {
    clearTimeout(timeoutRef.current);
    setShow(false);
  };

  const total = Number(data?.total_transactions || 0);
  const pieData = data ? [
    { name: 'Exitosas', value: Number(data.success_count || 0), fill: '#10B981' },
    { name: 'Pendientes', value: Number(data.pending_count || 0), fill: '#F59E0B' },
    { name: 'Fallidas', value: Number(data.failed_count || 0), fill: '#EF4444' },
  ].filter(d => d.value > 0) : [];

  return (
    <span className="relative inline-block" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <span className="cursor-pointer underline decoration-dotted underline-offset-2 text-gray-900">{name}</span>
      {show && (
        <div className="absolute z-50 left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl p-4 w-64" onMouseEnter={() => clearTimeout(timeoutRef.current)} onMouseLeave={handleLeave}>
          {!data ? (
            <div className="text-center py-4 text-gray-400 text-xs">Cargando...</div>
          ) : total === 0 ? (
            <div className="text-center py-4 text-gray-400 text-xs">Sin transacciones</div>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-800 truncate">{data.name || name}</p>
              <p className="text-xs text-gray-500 mb-2">{total.toLocaleString()} transacciones</p>
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={25} outerRadius={45} dataKey="value" paddingAngle={2}>
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-3 mt-1">
                {pieData.map(d => (
                  <span key={d.name} className="flex items-center gap-1 text-[10px] text-gray-500">
                    <span className="w-2 h-2 rounded-full" style={{ background: d.fill }} />
                    {d.name} ({total > 0 ? Math.round((d.value / total) * 100) : 0}%)
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </span>
  );
}

function MonitoringSection() {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [countryFilter, setCountryFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: commerces, isLoading } = useQuery({
    queryKey: ['tx-commerces'],
    queryFn: () => api.get('/transactions/commerces').then(r => r.data),
  });

  // Países únicos
  const countries = Array.from(new Set((commerces || []).map((c: any) => c.country).filter(Boolean))).sort() as string[];

  // Comercios filtrados por país
  const filteredCommerces = countryFilter
    ? (commerces || []).filter((c: any) => c.country === countryFilter)
    : (commerces || []);

  // Query multi-comercio
  const { data: multiSummary, isLoading: multiLoading } = useQuery({
    queryKey: ['tx-summary-multi', selectedIds.join(','), dateFrom, dateTo],
    queryFn: () => api.get('/transactions/summary-multi', {
      params: { ids: selectedIds.join(','), date_from: dateFrom || undefined, date_to: dateTo || undefined }
    }).then(r => r.data),
    enabled: selectedIds.length > 0,
  });

  // Query individual (para detalle cuando solo hay 1 seleccionado)
  const { data: summary } = useQuery({
    queryKey: ['tx-summary', selectedIds[0], dateFrom, dateTo],
    queryFn: () => api.get(`/transactions/summary/${selectedIds[0]}`, {
      params: { date_from: dateFrom || undefined, date_to: dateTo || undefined }
    }).then(r => r.data),
    enabled: selectedIds.length === 1,
  });

  const { data: movements } = useQuery({
    queryKey: ['tx-movements', selectedIds[0], dateFrom, dateTo],
    queryFn: () => api.get(`/transactions/movements/${selectedIds[0]}`, {
      params: { date_from: dateFrom || undefined, date_to: dateTo || undefined, limit: 20 }
    }).then(r => r.data),
    enabled: selectedIds.length === 1,
  });

  const toggleCommerce = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectAllFiltered = () => {
    const ids = filteredCommerces.map((c: any) => c.id);
    setSelectedIds(ids);
  };

  const clearSelection = () => setSelectedIds([]);

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Monitoreo de Transacciones</h2>
          <p className="text-sm text-gray-500">Datos en tiempo real de la base de producción</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              const token = localStorage.getItem('token');
              try {
                const params = new URLSearchParams();
                if (dateFrom) params.set('date_from', dateFrom);
                if (dateTo) params.set('date_to', dateTo);
                const qs = params.toString() ? `?${params.toString()}` : '';
                const response = await fetch(
                  `${import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL + '/api/v1' : '/api/v1'}/transactions/gateway-changes-export${qs}`,
                  { headers: { Authorization: `Bearer ${token}` } }
                );
                if (!response.ok) throw new Error('Error');
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `cambios_pasarelas_${new Date().toISOString().slice(0,10)}.xlsx`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
              } catch { toast.error('Error al descargar'); }
            }}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Download className="w-4 h-4" />
            Cambios Pasarelas
          </button>
          <button
            onClick={async () => {
              const token = localStorage.getItem('token');
              try {
                const response = await fetch(
                  `${import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL + '/api/v1' : '/api/v1'}/transactions/history-export`,
                  { headers: { Authorization: `Bearer ${token}` } }
                );
                if (!response.ok) throw new Error('Error');
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `historial_comercios_${new Date().toISOString().slice(0,10)}.xlsx`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
              } catch { toast.error('Error al descargar'); }
            }}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Download className="w-4 h-4" />
            Historial de Comercios
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4 p-3 bg-gray-50 rounded-lg items-end">
        <div>
          <label className="text-xs text-gray-500 block mb-1">País</label>
          <select
            className="input text-sm w-32"
            value={countryFilter}
            onChange={e => { setCountryFilter(e.target.value); setSelectedIds([]); }}
          >
            <option value="">Todos</option>
            {countries.map((c: string) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Comercios ({selectedIds.length} seleccionados)</label>
          <div className="flex gap-1">
            <button onClick={selectAllFiltered} className="btn-secondary text-xs px-2 py-1">Seleccionar todos</button>
            <button onClick={clearSelection} className="btn-secondary text-xs px-2 py-1">Limpiar</button>
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Desde</label>
          <input type="date" className="input text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Hasta</label>
          <input type="date" className="input text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
      </div>

      {/* Lista de comercios con checkboxes */}
      {!isLoading && (
        <div className="mb-4 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1">
            {filteredCommerces.map((c: any) => (
              <label key={c.id} className={`flex items-center gap-1.5 text-xs p-1.5 rounded cursor-pointer hover:bg-gray-50 ${selectedIds.includes(c.id) ? 'bg-pink-50 border border-pink-200' : ''}`}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(c.id)}
                  onChange={() => toggleCommerce(c.id)}
                  className="w-3 h-3 rounded border-gray-300 text-pink-500 focus:ring-pink-500"
                />
                <span className="truncate">{c.name}</span>
                <span className="text-gray-400 flex-shrink-0">({c.country || '—'})</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {isLoading && <div className="text-center py-8 text-gray-400">Cargando comercios...</div>}

      {multiLoading && <div className="text-center py-4 text-gray-400">Consultando transacciones...</div>}

      {/* Gráfico comparativo (múltiples comercios) */}
      {selectedIds.length >= 1 && multiSummary?.data?.length > 0 && (
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Comparativo de Transacciones</h4>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={multiSummary.data} margin={{ left: 10, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 9 }} angle={-30} textAnchor="end" height={70} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                  formatter={(v: any, name: string) => [Number(v).toLocaleString(), name === 'total_transactions' ? 'Total' : name === 'success_count' ? 'Exitosas' : name === 'pending_count' ? 'Pendientes' : 'Fallidas']}
                />
                <Legend />
                <Bar dataKey="success_count" name="Exitosas" fill="#10B981" stackId="a" />
                <Bar dataKey="pending_count" name="Pendientes" fill="#F59E0B" stackId="a" />
                <Bar dataKey="failed_count" name="Fallidas" fill="#EF4444" stackId="a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tabla resumen */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="table-header">Comercio</th>
                  <th className="table-header">País</th>
                  <th className="table-header text-right">Total</th>
                  <th className="table-header text-right">Exitosas</th>
                  <th className="table-header text-right">Pendientes</th>
                  <th className="table-header text-right">Fallidas</th>
                  <th className="table-header text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {multiSummary.data.map((c: any) => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="table-cell font-medium text-gray-900">{c.name}</td>
                    <td className="table-cell text-gray-500">{c.country || '—'}</td>
                    <td className="table-cell text-right font-semibold">{Number(c.total_transactions).toLocaleString()}</td>
                    <td className="table-cell text-right text-emerald-600">{Number(c.success_count || 0).toLocaleString()}</td>
                    <td className="table-cell text-right text-yellow-600">{Number(c.pending_count || 0).toLocaleString()}</td>
                    <td className="table-cell text-right text-red-500">{Number(c.failed_count || 0).toLocaleString()}</td>
                    <td className="table-cell text-right font-mono">${Number(c.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Gráficos circulares por comercio */}
          {multiSummary.data.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Distribución por Comercio</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {multiSummary.data.filter((c: any) => Number(c.total_transactions) > 0).map((c: any) => {
                  const pieData = [
                    { name: 'Exitosas', value: Number(c.success_count || 0), fill: '#10B981' },
                    { name: 'Pendientes', value: Number(c.pending_count || 0), fill: '#F59E0B' },
                    { name: 'Fallidas', value: Number(c.failed_count || 0), fill: '#EF4444' },
                  ].filter(d => d.value > 0);
                  return (
                    <div key={c.id} className="border border-gray-100 rounded-lg p-3">
                      <p className="text-xs font-semibold text-gray-700 mb-1 truncate">{c.name}</p>
                      <p className="text-xs text-gray-400 mb-2">{Number(c.total_transactions).toLocaleString()} transacciones</p>
                      <ResponsiveContainer width="100%" height={120}>
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={25} outerRadius={45} dataKey="value" paddingAngle={2}>
                            {pieData.map((entry, i) => (
                              <Cell key={i} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: any, name: string) => [Number(v).toLocaleString(), name]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex justify-center gap-3 mt-1">
                        {pieData.map(d => (
                          <span key={d.name} className="flex items-center gap-1 text-[10px] text-gray-500">
                            <span className="w-2 h-2 rounded-full" style={{ background: d.fill }} />
                            {d.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Resumen individual */}
      {selectedIds.length === 1 && summary && (
        <div className="space-y-4">
          {/* Totales */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Total Transacciones</p>
              <p className="text-xl font-bold text-gray-900">{Number(summary.totals?.total_transactions || 0).toLocaleString()}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Monto Total</p>
              <p className="text-xl font-bold text-gray-900">{summary.currency || '$'} {Number(summary.totals?.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Primera Transacción</p>
              <p className="text-sm font-medium text-gray-700">{summary.totals?.first_date ? new Date(summary.totals.first_date).toLocaleDateString('es-PE') : '—'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Última Transacción</p>
              <p className="text-sm font-medium text-gray-700">{summary.totals?.last_date ? new Date(summary.totals.last_date).toLocaleDateString('es-PE') : '—'}</p>
            </div>
          </div>

          {/* Por tipo */}
          {summary.summary?.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Por Tipo de Transacción</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="table-header">Tipo</th>
                      <th className="table-header">Estado</th>
                      <th className="table-header">Cantidad</th>
                      <th className="table-header">Monto Total</th>
                      <th className="table-header">% del Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.summary.map((s: any, i: number) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="table-cell font-medium">{s.type || '—'}</td>
                        <td className="table-cell">
                          <span className={`text-xs font-medium ${s.status === 'success' ? 'text-emerald-600' : s.status === 'pending' ? 'text-yellow-600' : 'text-red-500'}`}>{s.status || '—'}</span>
                        </td>
                        <td className="table-cell">{Number(s.total_transactions).toLocaleString()}</td>
                        <td className="table-cell font-mono">{summary.currency || '$'} {Number(s.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="table-cell">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-gray-100 rounded-full h-1.5">
                              <div className={`h-1.5 rounded-full ${s.status === 'success' ? 'bg-emerald-500' : s.status === 'pending' ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, s.percentage)}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-gray-700">{s.percentage}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Últimos movimientos */}
          {movements?.data?.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Últimos Pagos</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="table-header">Fecha</th>
                      <th className="table-header">Tipo</th>
                      <th className="table-header">Método</th>
                      <th className="table-header">Monto</th>
                      <th className="table-header">Estado</th>
                      <th className="table-header">UID</th>
                      <th className="table-header">Referencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.data.map((m: any) => (
                      <tr key={m.id} className="border-b border-gray-50">
                        <td className="table-cell text-xs">{new Date(m.created_at).toLocaleString('es-PE')}</td>
                        <td className="table-cell">{m.type || '—'}</td>
                        <td className="table-cell text-xs">{m.method || '—'}</td>
                        <td className="table-cell font-mono">{summary?.currency || '$'} {Number(m.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="table-cell">
                          <span className={`text-xs font-medium ${m.status === 'success' ? 'text-emerald-600' : m.status === 'pending' ? 'text-yellow-600' : 'text-red-500'}`}>
                            {m.status || '—'}
                          </span>
                        </td>
                        <td className="table-cell text-xs font-mono text-gray-500">{m.uid || '—'}</td>
                        <td className="table-cell text-xs font-mono text-gray-500">{m.reference || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-2">Mostrando {movements.data.length} de {movements.total} movimientos</p>
            </div>
          )}
        </div>
      )}

      {selectedIds.length === 0 && !isLoading && (
        <div className="text-center py-8 text-gray-400">Selecciona uno o más comercios para ver sus transacciones</div>
      )}
    </div>
  );
}
