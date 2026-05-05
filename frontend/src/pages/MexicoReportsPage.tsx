import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Eye, Download, Clock, CheckCircle, XCircle, Search } from 'lucide-react';
import api from '../lib/api';
import { timeAgo } from '../lib/utils';

interface MexicoSubmission {
  id: string;
  giro: string;
  mcc: string;
  trade_name: string;
  legal_name: string;
  rfc: string;
  address: string;
  postal_code: string;
  website: string;
  phone: string;
  fiscal_doc_path: string | null;
  ine_doc_path: string | null;
  domicilio_doc_path: string | null;
  acta_doc_path: string | null;
  licencia_doc_path: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'Pendiente', color: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Clock },
  reviewed: { label: 'Revisado', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Eye },
  approved: { label: 'Aprobado', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle },
  rejected: { label: 'Rechazado', color: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
};

export default function MexicoReportsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['mexico-submissions', statusFilter, page],
    queryFn: () => api.get('/mexico/submissions', { params: { status: statusFilter || undefined, page, limit: 20 } }).then(r => r.data),
  });

  const { data: detail } = useQuery<MexicoSubmission>({
    queryKey: ['mexico-submission', selectedId],
    queryFn: () => api.get(`/mexico/submissions/${selectedId}`).then(r => r.data),
    enabled: !!selectedId,
  });

  const submissions: MexicoSubmission[] = data?.data || [];
  const total = data?.total || 0;

  const baseUrl = import.meta.env.VITE_API_URL || '';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reportería México</h1>
          <p className="text-sm text-gray-500">Formularios recibidos de comercios en México</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input text-sm"
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">Todos los estados</option>
            <option value="pending">Pendiente</option>
            <option value="reviewed">Revisado</option>
            <option value="approved">Aprobado</option>
            <option value="rejected">Rechazado</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Comercio</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Giro</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">RFC</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Estado</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Fecha</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">Cargando...</td></tr>
            ) : submissions.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">No hay formularios recibidos</td></tr>
            ) : submissions.map(sub => {
              const st = STATUS_CONFIG[sub.status] || STATUS_CONFIG.pending;
              const Icon = st.icon;
              return (
                <tr key={sub.id} className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer" onClick={() => setSelectedId(sub.id)}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{sub.trade_name}</p>
                    <p className="text-xs text-gray-500">{sub.legal_name}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{sub.giro}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{sub.rfc}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${st.color}`}>
                      <Icon className="w-3 h-3" /> {st.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{timeAgo(sub.created_at)}</td>
                  <td className="px-4 py-3">
                    <button className="text-gray-400 hover:text-pink-500"><Eye className="w-4 h-4" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-xs disabled:opacity-40">Anterior</button>
          <span className="text-sm text-gray-500 py-2">Página {page} de {Math.ceil(total / 20)}</span>
          <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)} className="btn-secondary text-xs disabled:opacity-40">Siguiente</button>
        </div>
      )}

      {/* Detail Modal */}
      {selectedId && detail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelectedId(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{detail.trade_name}</h3>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Giro:</span> <strong>{detail.giro}</strong></div>
              <div><span className="text-gray-500">MCC:</span> <strong>{detail.mcc}</strong></div>
              <div><span className="text-gray-500">Nombre legal:</span> <strong>{detail.legal_name}</strong></div>
              <div><span className="text-gray-500">RFC:</span> <strong>{detail.rfc}</strong></div>
              <div className="col-span-2"><span className="text-gray-500">Dirección:</span> <strong>{detail.address}</strong></div>
              <div><span className="text-gray-500">C.P.:</span> <strong>{detail.postal_code}</strong></div>
              <div><span className="text-gray-500">Teléfono:</span> <strong>{detail.phone}</strong></div>
              <div className="col-span-2"><span className="text-gray-500">Sitio web:</span> <a href={detail.website} target="_blank" className="text-pink-600 underline">{detail.website}</a></div>
            </div>

            {/* Documents */}
            <h4 className="font-semibold text-gray-900 mt-6 mb-3">Documentos</h4>
            <div className="space-y-2">
              {[
                { label: 'Constancia fiscal', path: detail.fiscal_doc_path },
                { label: 'INE Representante', path: detail.ine_doc_path },
                { label: 'Comprobante domicilio', path: detail.domicilio_doc_path },
                { label: 'Acta constitutiva', path: detail.acta_doc_path },
                { label: 'Licencia casino', path: detail.licencia_doc_path },
              ].filter(d => d.path).map(doc => (
                <div key={doc.label} className="flex items-center gap-3 p-2 border border-gray-100 rounded-lg">
                  <FileText className="w-5 h-5 text-pink-500" />
                  <span className="flex-1 text-sm text-gray-700">{doc.label}</span>
                  <a href={`${baseUrl}/uploads/${doc.path}`} target="_blank" className="text-xs text-pink-600 hover:underline">Ver</a>
                  <a href={`${baseUrl}/uploads/${doc.path}`} download className="text-xs text-gray-500 hover:underline">Descargar</a>
                </div>
              ))}
            </div>

            {/* Status update */}
            <div className="mt-6 pt-4 border-t border-gray-100">
              <label className="text-sm font-medium text-gray-700">Cambiar estado:</label>
              <div className="flex gap-2 mt-2">
                {['pending', 'reviewed', 'approved', 'rejected'].map(s => {
                  const cfg = STATUS_CONFIG[s];
                  return (
                    <button
                      key={s}
                      onClick={async () => {
                        await api.put(`/mexico/submissions/${detail.id}/status`, { status: s });
                        setSelectedId(null);
                      }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${detail.status === s ? cfg.color + ' ring-2 ring-offset-1 ring-pink-300' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
