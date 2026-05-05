import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Edit, FileText, MessageSquare, CheckSquare,
  Globe, Phone, Building, CreditCard, AlertTriangle,
  Upload, Send, CheckCircle, Clock,
  ShoppingBag, Lock, Trash2, Shield, X
} from 'lucide-react';
import api from '../lib/api';
import { Merchant, STATUS_LABELS, STATUS_COLORS, MerchantStatus } from '../types';
import { formatDateTime, timeAgo, scoreColor, scoreBarColor, formatCurrency, formatFileSize } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { getStatuses, getStatusConfig, getRiskConfig, useConfigRefresh } from '../lib/config';
import { getActiveCountries } from '../lib/countries';
import toast from 'react-hot-toast';
import { useDropzone } from 'react-dropzone';

const TABS = ['Resumen', 'Timeline', 'Documentos', 'Tareas'];
const FINALIZED_STATUSES = ['finalizado', 'certified', 'inactive', 'rejected'];

// Robust check — trims and lowercases to avoid trailing underscore issues
const isMerchantFinalized = (status: string) =>
  FINALIZED_STATUSES.includes((status || '').trim().toLowerCase());

export default function MerchantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useConfigRefresh();
  const [tab, setTab] = useState('Resumen');
  const [comment, setComment] = useState('');
  const [statusModal, setStatusModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [certModal, setCertModal] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('pending');
  const [statusReason, setStatusReason] = useState('');

  const { data: merchant, isLoading } = useQuery<Merchant>({
    queryKey: ['merchant', id],
    queryFn: () => api.get(`/merchants/${id}`).then(r => r.data),
  });

  const { data: timeline } = useQuery({
    queryKey: ['timeline', id],
    queryFn: () => api.get(`/merchants/${id}/timeline`).then(r => r.data),
    enabled: tab === 'Timeline',
  });

  const { data: documents } = useQuery({
    queryKey: ['documents', id],
    queryFn: () => api.get(`/documents/merchant/${id}`).then(r => r.data),
    enabled: tab === 'Documentos',
  });

  const { data: tasks } = useQuery({
    queryKey: ['tasks', id],
    queryFn: () => api.get('/tasks', { params: { merchant_id: id } }).then(r => r.data),
    enabled: tab === 'Tareas',
  });

  // Join merchant socket room
  useEffect(() => {
    if (socket && id) {
      socket.emit('join:merchant', id);
      socket.on('merchant:updated', () => queryClient.invalidateQueries({ queryKey: ['merchant', id] }));
      socket.on('comment:new', () => queryClient.invalidateQueries({ queryKey: ['timeline', id] }));
      socket.on('document:uploaded', () => queryClient.invalidateQueries({ queryKey: ['documents', id] }));
      return () => {
        socket.emit('leave:merchant', id);
        socket.off('merchant:updated');
        socket.off('comment:new');
        socket.off('document:uploaded');
      };
    }
  }, [socket, id, queryClient]);

  const addComment = useMutation({
    mutationFn: () => api.post('/comments', { merchant_id: id, content: comment }),
    onSuccess: () => {
      setComment('');
      queryClient.invalidateQueries({ queryKey: ['timeline', id] });
      toast.success('Comentario agregado');
    },
  });

  const changeStatus = useMutation({
    mutationFn: () => api.patch(`/merchants/${id}/status`, { status: newStatus, reason: statusReason }),
    onSuccess: () => {
      setStatusModal(false);
      setStatusReason('');
      queryClient.invalidateQueries({ queryKey: ['merchant', id] });
      queryClient.invalidateQueries({ queryKey: ['merchants'] });
      toast.success('Estado actualizado');
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || 'Error al cambiar estado';
      const code = err.response?.data?.code;
      if (code === 'SCORE_TOO_LOW') {
        const current  = err.response?.data?.currentScore;
        const required = err.response?.data?.requiredScore;
        toast.error(`Score insuficiente: ${current}/100 (mínimo ${required} para finalizar)`, { duration: 6000 });
      } else {
        toast.error(msg);
      }
    },
  });

  const uploadDoc = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('merchant_id', id!);
      return api.post('/documents/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', id] });
      toast.success('Documento subido');
    },
    onError: () => toast.error('Error al subir documento'),
  });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => files.forEach(f => uploadDoc.mutate(f)),
    accept: { 'application/pdf': [], 'image/*': [], 'application/msword': [], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [] },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: '#FC2B5F', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (!merchant) return <div className="text-gray-500">Comercio no encontrado</div>;

  const canChangeStatus = user?.role === 'admin' || user?.role === 'onboarding';
  const canEdit         = user?.role === 'admin' || user?.role === 'onboarding';
  const canComment      = user?.role === 'admin' || user?.role === 'onboarding';
  const canUpload       = user?.role === 'admin' || user?.role === 'onboarding';
  const statusCfg = getStatusConfig(merchant.status);
  const riskCfg   = getRiskConfig(merchant.risk_level);
  const allStatuses = getStatuses();
  const activeCountries = getActiveCountries();
  const isFinalized = isMerchantFinalized(merchant.status);

  // Helper: resolve country name from code or return as-is
  const resolveCountry = (val?: string) => {
    if (!val) return undefined;
    const found = activeCountries.find(c => c.code === val);
    return found ? `${found.flag} ${found.name}` : val;
  };

  // Parse extra fields stored in payment_methods_detail or notes
  const paymentConfig: any[] = Array.isArray(merchant.payment_methods_detail)
    ? merchant.payment_methods_detail
    : [];

  // Parse _meta block from notes
  let meta: Record<string, any> = {};
  let cleanNotes = merchant.notes || '';
  try {
    const metaMatch = cleanNotes.match(/^\{\"_meta\":true.*?\}/);
    if (metaMatch) {
      meta = JSON.parse(metaMatch[0]);
      cleanNotes = cleanNotes.replace(metaMatch[0], '').trim();
    }
  } catch { /* ignore */ }

  // Use meta risk_label if available, fallback to DB risk_level
  const displayRiskValue = meta.risk_label || merchant.risk_level;
  const riskCfgDisplay = getRiskConfig(displayRiskValue);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-700 mt-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{merchant.legal_name}</h1>
            <span
              className="badge text-xs font-semibold px-2.5 py-1"
              style={{ backgroundColor: statusCfg.hex + '20', color: statusCfg.hex, border: `1px solid ${statusCfg.hex}40` }}
            >
              {statusCfg.label}
            </span>
            <span
              className="badge text-xs font-semibold px-2.5 py-1"
              style={{ backgroundColor: riskCfgDisplay.hex + '20', color: riskCfgDisplay.hex, border: `1px solid ${riskCfgDisplay.hex}40` }}
            >
              {riskCfgDisplay.icon} {riskCfgDisplay.label}
            </span>
          </div>
          {merchant.trade_name && <p className="text-gray-500 text-sm mt-0.5">{merchant.trade_name}</p>}
          <p className="text-gray-400 text-xs mt-1">
            Última actividad: {timeAgo(merchant.last_activity_at)}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {canChangeStatus && !isFinalized && (
            <button
              onClick={() => { setNewStatus(merchant.status as string); setStatusModal(true); }}
              className="btn-secondary text-sm"
            >
              Cambiar Estado
            </button>
          )}
          {canEdit && !isFinalized && (
            <Link to={`/merchants/${id}/edit`} className="btn-primary flex items-center gap-2 text-sm">
              <Edit className="w-4 h-4" />
              Editar
            </Link>
          )}
          {user?.role === 'admin' && (
            <button
              onClick={() => setDeleteModal(true)}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Eliminar
            </button>
          )}
          {(user?.role === 'admin' || user?.role === 'onboarding') && (
            <button
              onClick={() => setCertModal(true)}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors"
            >
              <Shield className="w-4 h-4" />
              Generar Certificación
            </button>
          )}
          {isFinalized && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-teal-50 border border-teal-200">
              <Lock className="w-4 h-4 text-teal-600" />
              <span className="text-sm font-medium text-teal-700">Comercio Finalizado</span>
            </div>
          )}
        </div>
      </div>

      {/* Score bar */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-500">Score de Riesgo</span>
          <span className={`text-2xl font-bold ${scoreColor(merchant.score)}`}>{merchant.score}/100</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${scoreBarColor(merchant.score)}`}
            style={{ width: `${merchant.score}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>0 - Crítico</span>
          <span>100 - Excelente</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-transparent text-white'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            style={tab === t ? { color: '#FC2B5F', borderColor: '#FC2B5F' } : undefined}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab: Resumen */}
      {tab === 'Resumen' && (
        <div className="space-y-6">

          {/* Row 1: Datos Generales + Contacto */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            <InfoSection title="Datos Generales" icon={Building}>
              <InfoRow label="Nombre comercio"   value={merchant.trade_name} />
              <InfoRow label="Razón social"       value={merchant.legal_name} />
              <InfoRow label="RUT/DNI/RUC"        value={merchant.tax_id} mono />
              <InfoRow label="Tipo de solicitud"  value={meta.request_type || (merchant as any).request_type} />
              <InfoRow label="Tipo comercio"      value={merchant.business_type} />
              <InfoRow label="Categoría"          value={meta.category || (merchant as any).category} />
              <InfoRow label="Rubro"              value={merchant.industry} />
              <InfoRow label="MCC"                value={merchant.mcc_code ? `${merchant.mcc_code} — ${merchant.mcc_description || ''}` : undefined} />
              <InfoRow label="País"               value={resolveCountry(merchant.country)} />
              <InfoRow label="País origen"        value={resolveCountry(meta.origin_country || (merchant as any).origin_country)} />
              <InfoRow label="Dirección"          value={merchant.address} />
              {merchant.website && (
                <InfoRow label="URL comercio" value={
                  <a href={merchant.website} target="_blank" rel="noopener noreferrer"
                    className="hover:underline truncate block" style={{ color: '#FC2B5F' }}>
                    {merchant.website}
                  </a>
                } />
              )}
            </InfoSection>

            <InfoSection title="Contacto Principal" icon={Phone}>
              <InfoRow label="Persona"      value={merchant.contact_name} />
              <InfoRow label="Email"        value={merchant.contact_email} />
              <InfoRow label="Teléfono"     value={merchant.contact_phone} />
              <InfoRow label="Cargo"        value={merchant.contact_position} />
              {merchant.secondary_contact_name && (
                <>
                  <div className="border-t border-gray-100 my-2" />
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Contacto Secundario</p>
                  <InfoRow label="Nombre"   value={merchant.secondary_contact_name} />
                  <InfoRow label="Email"    value={merchant.secondary_contact_email} />
                  <InfoRow label="Teléfono" value={merchant.secondary_contact_phone} />
                </>
              )}
            </InfoSection>

          </div>

          {/* Row 2: Configuración comercial + Onboarding */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            <InfoSection title="Configuración Comercial" icon={ShoppingBag}>
              <InfoRow label="Email comercio"    value={meta.merchant_email || (merchant as any).merchant_email} />
              <InfoRow label="Usuario"           value={meta.merchant_user || (merchant as any).merchant_user} />
              <InfoRow label="Email reportes"    value={meta.report_email || (merchant as any).report_email} />
              <InfoRow label="¿Va con IVA?"      value={(meta.has_iva || (merchant as any).has_iva) === 'yes' ? 'Sí' : (meta.has_iva || (merchant as any).has_iva) === 'no' ? 'No' : undefined} />
              <InfoRow label="Pagos terceros"    value={(meta.accepts_third_party || (merchant as any).accepts_third_party) === 'yes' ? 'Sí' : (meta.accepts_third_party || (merchant as any).accepts_third_party) === 'no' ? 'No' : undefined} />
              <InfoRow label="Canal com."        value={meta.communication_channel || (merchant as any).communication_channel} />
            </InfoSection>

            <InfoSection title="Onboarding" icon={CheckCircle}>
              <InfoRow label="KAM / Asignado"   value={merchant.assigned_to_name} />
              <InfoRow label="Resp. Onboarding"  value={(merchant as any).onboarding_assigned_to_name} />
              <InfoRow label="Estado"            value={statusCfg.label} />
              <InfoRow label="Nivel de riesgo"   value={`${riskCfgDisplay.icon} ${riskCfgDisplay.label}`} />
              <InfoRow label="Score"             value={`${merchant.score}/100`} />
              <InfoRow label="Inicio onboarding" value={merchant.onboarding_started_at ? formatDateTime(merchant.onboarding_started_at) : undefined} />
              <InfoRow label="Completado"        value={merchant.onboarding_completed_at ? formatDateTime(merchant.onboarding_completed_at) : undefined} />
              {cleanNotes && (
                <div className="mt-2 p-2.5 bg-gray-50 rounded-lg text-xs text-gray-600 leading-relaxed">
                  <p className="font-semibold text-gray-400 uppercase tracking-wide text-xs mb-1">Notas</p>
                  {cleanNotes}
                </div>
              )}
            </InfoSection>

          </div>

          {/* Row 3: Métodos de Pago por País */}
          {paymentConfig.length > 0 && (
            <InfoSection title="Métodos de Pago por País" icon={CreditCard}>
              <div className="space-y-4 mt-1">
                {paymentConfig.map((pc: any) => {
                  const countryObj = activeCountries.find(c => c.code === pc.country_code);
                  return (
                    <div key={pc.country_code} className="border border-gray-100 rounded-xl overflow-hidden">
                      <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                        <span className="text-sm font-semibold text-gray-700">
                          {countryObj?.flag} {pc.country_name}
                        </span>
                      </div>
                      <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-4">

                        {/* Pay In */}
                        {pc.pay_in?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pay In</p>
                            <div className="space-y-2">
                              {pc.pay_in.map((m: any) => (
                                <PayMethodCard key={m.method_id} method={m} />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Pay Out */}
                        {(pc.pay_out?.length > 0 || pc.pay4u) && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pay Out</p>
                            <div className="space-y-2">
                              {pc.pay_out?.map((m: any) => (
                                <PayMethodCard key={m.method_id} method={m} />
                              ))}
                              {/* Pay4U */}
                              {pc.pay4u && (pc.pay4u.amount_over_fee || pc.pay4u.amount_between_fee) && (
                                <div className="border border-dashed border-gray-200 rounded-lg p-2.5 bg-gray-50">
                                  <p className="text-xs font-semibold text-gray-600 mb-1.5">Pay4U</p>
                                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                    {pc.pay4u.amount_over_fee && <InfoRow label="Monto sobre" value={`${pc.pay4u.amount_over_fee} ${pc.pay4u.currency}`} />}
                                    {pc.pay4u.amount_between_fee && <InfoRow label="Monto entre" value={`${pc.pay4u.amount_between_fee} ${pc.pay4u.currency}`} />}
                                    {pc.pay4u.has_tax && <InfoRow label="Impuesto" value="Sí" />}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                      </div>
                    </div>
                  );
                })}
              </div>
            </InfoSection>
          )}

        </div>
      )}

      {/* Tab: Timeline */}
      {tab === 'Timeline' && (
        <div className="space-y-4">
          {/* Add comment — blocked if finalized or commercial role */}
          {isFinalized ? (
            <div className="card p-4 flex items-center gap-3 bg-gray-50 border-gray-200">
              <Lock className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-600">Comercio finalizado</p>
                <p className="text-xs text-gray-400">No se pueden agregar comentarios a un comercio finalizado.</p>
              </div>
            </div>
          ) : !canComment ? (
            <div className="card p-4 flex items-center gap-3 bg-blue-50 border-blue-200">
              <Lock className="w-5 h-5 text-blue-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-700">Solo lectura</p>
                <p className="text-xs text-blue-500">El rol Comercial no puede agregar comentarios.</p>
              </div>
            </div>
          ) : (
            <div className="card">
              <label className="label">Agregar comentario interno</label>
              <textarea
                className="input h-20 resize-none"
                placeholder="Escribe un comentario..."
                value={comment}
                onChange={e => setComment(e.target.value)}
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={() => addComment.mutate()}
                  disabled={!comment.trim() || addComment.isPending}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  <Send className="w-4 h-4" />
                  Enviar
                </button>
              </div>
            </div>
          )}

          {/* Timeline items */}
          <div className="space-y-3">
            {(timeline || []).map((item: any) => (
              <TimelineItem key={item.id} item={item} />
            ))}
            {(!timeline || timeline.length === 0) && (
              <div className="text-center py-8 text-gray-400">No hay actividad registrada</div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Documentos */}
      {tab === 'Documentos' && (
        <div className="space-y-4">
          {/* Upload zone — blocked if finalized or commercial role */}
          {isFinalized ? (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center bg-gray-50">
              <Lock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-400 text-sm font-medium">Comercio finalizado</p>
              <p className="text-gray-400 text-xs mt-1">No se pueden subir documentos a un comercio finalizado.</p>
            </div>
          ) : !canUpload ? (
            <div className="border-2 border-dashed border-blue-200 rounded-xl p-8 text-center bg-blue-50">
              <Lock className="w-8 h-8 text-blue-300 mx-auto mb-2" />
              <p className="text-blue-600 text-sm font-medium">Solo lectura</p>
              <p className="text-blue-400 text-xs mt-1">El rol Comercial no puede subir documentos.</p>
            </div>
          ) : (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-rose-400 bg-rose-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">
                {isDragActive ? 'Suelta los archivos aquí' : 'Arrastra archivos o haz clic para subir'}
              </p>
              <p className="text-gray-400 text-xs mt-1">PDF, imágenes, Word, Excel (máx. 10MB)</p>
            </div>
          )}

          <div className="space-y-2">
            {(documents || []).map((doc: any) => (
              <div key={doc.id} className="card p-4 flex items-center gap-4">
                <FileText className="w-8 h-8 flex-shrink-0" style={{ color: '#FC2B5F' }} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{doc.name}</p>
                  <p className="text-xs text-gray-500">
                    {doc.document_type} · {formatFileSize(doc.file_size)} · {timeAgo(doc.created_at)}
                  </p>
                  <p className="text-xs text-gray-400">Subido por {doc.uploaded_by_name}</p>
                </div>
                {doc.is_verified && (
                  <span className="badge bg-emerald-50 text-emerald-600 flex-shrink-0">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Verificado
                  </span>
                )}
                <a
                  href={`/uploads/${doc.file_path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary text-xs py-1.5 px-3 flex-shrink-0"
                >
                  Ver
                </a>
              </div>
            ))}
            {(!documents || documents.length === 0) && (
              <div className="text-center py-8 text-gray-400">No hay documentos</div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Tareas */}
      {tab === 'Tareas' && (
        <div className="space-y-3">
          {(tasks?.data || []).map((task: any) => (
            <div key={task.id} className="card p-4 flex items-start gap-3">
              <CheckSquare className={`w-5 h-5 flex-shrink-0 mt-0.5 ${task.status === 'completed' ? 'text-emerald-500' : 'text-gray-400'}`} />
              <div className="flex-1">
                <p className={`font-medium text-sm ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                  {task.title}
                </p>
                {task.description && <p className="text-xs text-gray-500 mt-0.5">{task.description}</p>}
                <div className="flex items-center gap-3 mt-1">
                  <span className={`badge text-xs ${task.priority === 'urgent' ? 'bg-red-50 text-red-500' : task.priority === 'high' ? 'bg-orange-50 text-orange-500' : 'bg-gray-100 text-gray-500'}`}>
                    {task.priority}
                  </span>
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
              </div>
            </div>
          ))}
          {(!tasks?.data || tasks.data.length === 0) && (
            <div className="text-center py-8 text-gray-400">No hay tareas</div>
          )}
        </div>
      )}

      {/* Status Change Modal */}
      {statusModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Cambiar Estado</h3>
            <div className="space-y-4">
              <div>
                <label className="label">Nuevo Estado</label>
                <select
                  className="input"
                  value={newStatus}
                  onChange={e => setNewStatus(e.target.value)}
                >
                  {allStatuses.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Score warning when selecting finalizado */}
              {(isMerchantFinalized(newStatus)) && (merchant.score ?? 0) < 80 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-orange-50 border border-orange-200">
                  <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-orange-700">Score insuficiente</p>
                    <p className="text-xs text-orange-600 mt-0.5">
                      El comercio tiene un score de <strong>{merchant.score}/100</strong>.
                      Se requiere mínimo <strong>80</strong> para finalizar.
                    </p>
                  </div>
                </div>
              )}

              {/* Confirmation when score is OK for finalizado */}
              {isMerchantFinalized(newStatus) && (merchant.score ?? 0) >= 80 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-teal-50 border border-teal-200">
                  <CheckCircle className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-teal-700">Listo para finalizar</p>
                    <p className="text-xs text-teal-600 mt-0.5">
                      Score: <strong>{merchant.score}/100</strong>. Una vez finalizado, no se podrán agregar comentarios ni documentos.
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="label">Motivo (opcional)</label>
                <textarea
                  className="input h-20 resize-none"
                  value={statusReason}
                  onChange={e => setStatusReason(e.target.value)}
                  placeholder="Razón del cambio de estado..."
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setStatusModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button
                onClick={() => changeStatus.mutate()}
                disabled={changeStatus.isPending || (isMerchantFinalized(newStatus) && (merchant.score ?? 0) < 80)}
                className="btn-primary flex-1 disabled:opacity-40"
              >
                {changeStatus.isPending ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Certification Modal */}
      {certModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Generar Certificación</h3>
              <button onClick={() => setCertModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <iframe
                src="https://certificaciones.prontopaga.com/"
                className="w-full h-full border-0"
                title="Certificaciones ProntoPaga"
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Eliminar Comercio</h3>
            <p className="text-sm text-gray-600 mb-1">
              ¿Estás seguro de que deseas eliminar <strong>{merchant.trade_name || merchant.legal_name}</strong>?
            </p>
            <p className="text-xs text-red-500 mb-4">
              Esta acción es irreversible. Se eliminarán todos los datos asociados (documentos, comentarios, tareas, historial).
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button
                onClick={async () => {
                  try {
                    await api.delete(`/merchants/${id}`);
                    toast.success('Comercio eliminado');
                    queryClient.invalidateQueries({ queryKey: ['merchants'] });
                    navigate('/merchants');
                  } catch (err: any) {
                    toast.error(err.response?.data?.error || 'Error al eliminar');
                  } finally {
                    setDeleteModal(false);
                  }
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoSection({ title, icon: Icon, children }: any) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100">
        <Icon className="w-4 h-4 text-gray-400" />
        <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value?: any; mono?: boolean }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="text-xs text-gray-400 w-28 flex-shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm text-gray-700 flex-1 ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

function PayMethodCard({ method }: { method: any }) {
  return (
    <div className="flex items-start justify-between p-2 rounded-lg bg-white border border-gray-100 text-xs">
      <div className="font-medium text-gray-700">{method.method_name}</div>
      <div className="text-right space-y-0.5 text-gray-500">
        {method.provider && <div>{method.provider}</div>}
        {method.commission && <div>Com: {method.commission}%</div>}
        {method.fee && <div>Tarifa: {method.fee} {method.currency}</div>}
        {method.min_fee && <div>Mín: {method.min_fee}</div>}
      </div>
    </div>
  );
}

function TimelineItem({ item }: { item: any }) {
  const typeConfig: Record<string, { color: string; icon: any }> = {
    comment: { color: 'bg-blue-50', icon: MessageSquare },
    status_change: { color: 'bg-yellow-50', icon: AlertTriangle },
    document: { color: 'bg-green-50', icon: FileText },
    task: { color: 'bg-purple-50', icon: CheckSquare },
  };

  const iconColors: Record<string, string> = {
    comment: 'text-blue-500',
    status_change: 'text-yellow-500',
    document: 'text-green-500',
    task: 'text-purple-500',
  };

  const config = typeConfig[item.type] || typeConfig.comment;
  const iconColor = iconColors[item.type] || iconColors.comment;
  const Icon = config.icon;

  return (
    <div className="flex gap-3">
      <div className={`w-7 h-7 rounded-full ${config.color} flex items-center justify-center flex-shrink-0 mt-0.5`}>
        <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
      </div>
      <div className="flex-1 card p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-gray-900">{item.user_name}</span>
          <span className="text-xs text-gray-400">{timeAgo(item.created_at)}</span>
        </div>
        {item.type === 'comment' && <p className="text-sm text-gray-700">{item.content}</p>}
        {item.type === 'status_change' && (
          <p className="text-sm text-gray-700">
            Estado cambiado de <span className="text-yellow-600">{item.old_status}</span> a{' '}
            <span className="text-green-600">{item.new_status}</span>
            {item.reason && <span className="text-gray-400"> — {item.reason}</span>}
          </p>
        )}
        {item.type === 'document' && (
          <p className="text-sm text-gray-700">Documento subido: <span style={{ color: '#FC2B5F' }}>{item.name}</span></p>
        )}
        {item.type === 'task' && (
          <p className="text-sm text-gray-700">Tarea: <span className="text-purple-600">{item.title}</span> ({item.status})</p>
        )}
      </div>
    </div>
  );
}
