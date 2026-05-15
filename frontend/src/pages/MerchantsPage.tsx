import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../lib/api';
import { Merchant, STATUS_LABELS, STATUS_COLORS } from '../types';
import { timeAgo, scoreColor, scoreBarColor } from '../lib/utils';
import { getStatuses, useConfigRefresh } from '../lib/config';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useSlaStatus } from '../lib/hooks/useSlaStatus';
import SlaIndicator from '../components/SlaIndicator';

export default function MerchantsPage() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const isCommercial = user?.role === 'commercial';
  const { data: slaData } = useSlaStatus();
  useConfigRefresh();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('created_at');

  // Escuchar eliminaciones de comercios en tiempo real
  useEffect(() => {
    if (!socket) return;
    const handler = () => queryClient.invalidateQueries({ queryKey: ['merchants'] });
    socket.on('merchant:deleted', handler);
    return () => { socket.off('merchant:deleted', handler); };
  }, [socket, queryClient]);

  const statuses = getStatuses();

  const { data, isLoading } = useQuery({
    queryKey: ['merchants', page, search, status, sort],
    queryFn: () => api.get('/merchants', {
      params: {
        page,
        limit: 20,
        search: search || undefined,
        status: status || undefined,
        sort,
      },
    }).then(r => r.data),
    placeholderData: (prev) => prev,
  });

  const merchants: Merchant[] = data?.data || [];
  const total      = data?.total      || 0;
  const totalPages = data?.totalPages || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Comercios</h1>
          <p className="text-gray-500 text-sm mt-1">{total} comercios registrados</p>
        </div>
        {/* Commercial can add new merchants */}
        <Link to="/merchants/new" className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" />
          Nuevo Comercio
        </Link>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="flex-1 min-w-48 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              className="input pl-9"
              placeholder="Buscar por nombre, RUC, email..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>

          {/* Estado — usa estados dinámicos del dashboard */}
          <select
            className="input w-auto"
            value={status}
            onChange={e => { setStatus(e.target.value); setPage(1); }}
          >
            <option value="">Todos los estados</option>
            {statuses.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          {/* Ordenar */}
          <select
            className="input w-auto"
            value={sort}
            onChange={e => setSort(e.target.value)}
          >
            <option value="created_at">Más recientes</option>
            <option value="score">Mayor score</option>
            <option value="last_activity_at">Última actividad</option>
            <option value="legal_name">Nombre A-Z</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div
              className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: '#FC2B5F', borderTopColor: 'transparent' }}
            />
          </div>
        ) : merchants.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Building2 className="w-10 h-10 mb-3 opacity-30" />
            <p>No se encontraron comercios</p>
            <Link
              to="/merchants/new"
              className="text-sm mt-2 hover:underline font-medium"
              style={{ color: '#FC2B5F' }}
            >
              Registrar el primero
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Comercio</th>
                  <th className="table-header">RUC / Tax ID</th>
                  <th className="table-header">MCC</th>
                  <th className="table-header">Estado</th>
                  <th className="table-header">SLA</th>
                  <th className="table-header">Score</th>
                  <th className="table-header">Asignado a</th>
                  <th className="table-header">Resp. Onboarding</th>
                  <th className="table-header">Última actividad</th>
                </tr>
              </thead>
              <tbody>
                {merchants.map(m => (
                  <tr
                    key={m.id}
                    className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                  >
                    {/* Nombre */}
                    <td className="table-cell">
                      <Link
                        to={`/merchants/${m.id}`}
                        className="hover:underline transition-colors"
                        style={{ color: 'inherit' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#FC2B5F')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'inherit')}
                      >
                        <p className="font-semibold text-gray-900">{m.legal_name}</p>
                        {m.trade_name && (
                          <p className="text-xs text-gray-400">{m.trade_name}</p>
                        )}
                      </Link>
                    </td>

                    {/* RUC */}
                    <td className="table-cell font-mono text-xs text-gray-600">
                      {m.tax_id}
                    </td>

                    {/* MCC */}
                    <td className="table-cell">
                      <span className="text-xs font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                        {m.mcc_code}
                      </span>
                    </td>

                    {/* Estado */}
                    <td className="table-cell">
                      <span className={`badge ${STATUS_COLORS[m.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[m.status] ?? m.status}
                      </span>
                    </td>

                    {/* SLA */}
                    <td className="table-cell">
                      <SlaIndicator result={slaData?.merchants[m.id]} />
                    </td>

                    {/* Score */}
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${scoreColor(m.score)}`}>
                          {m.score}
                        </span>
                        <div className="w-16 bg-gray-100 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${scoreBarColor(m.score)}`}
                            style={{ width: `${m.score}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Asignado */}
                    <td className="table-cell text-xs text-gray-500">
                      {m.assigned_to_name || '—'}
                    </td>

                    {/* Resp. Onboarding */}
                    <td className="table-cell text-xs text-gray-500">
                      {(m as any).onboarding_assigned_to_name || '—'}
                    </td>

                    {/* Actividad */}
                    <td className="table-cell text-xs text-gray-400">
                      {timeAgo(m.last_activity_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-sm text-gray-500">
              Página {page} de {totalPages} ({total} total)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary py-1.5 px-3 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-secondary py-1.5 px-3 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
