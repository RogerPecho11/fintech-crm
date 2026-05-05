import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, FileText, Eye, Download } from 'lucide-react';
import { Merchant, User } from '../types';
import api from '../lib/api';

interface Props {
  merchant: Merchant;
  onClose: () => void;
}

type TabKey = 'info' | 'limits' | 'transactions' | 'payments' | 'ux' | 'performance' | 'comments' | 'images';
type Environment = 'sandbox' | 'production';

const TABS: { key: TabKey; icon: string; label: string }[] = [
  { key: 'info', icon: '📋', label: 'Información Básica' },
  { key: 'limits', icon: '📏', label: 'Límites' },
  { key: 'transactions', icon: '💳', label: 'Transacciones' },
  { key: 'payments', icon: '💰', label: 'Métodos de Pago' },
  { key: 'ux', icon: '👤', label: 'UX' },
  { key: 'performance', icon: '⚡', label: 'Rendimiento' },
  { key: 'comments', icon: '💬', label: 'Comentarios' },
  { key: 'images', icon: '🖼️', label: 'Imágenes' },
];

export default function CertificationForm({ merchant, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('info');
  const [env, setEnv] = useState<Environment>('sandbox');

  const { data: users } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
  });

  const commercials = (users || []).filter(u => u.role === 'commercial' || u.role === 'admin');
  const onboardingUsers = (users || []).filter(u => u.role === 'onboarding' || u.role === 'admin');

  const [form, setForm] = useState({
    // Info Básica
    review_date: new Date().toISOString().split('T')[0],
    merchant_name: merchant.trade_name || merchant.legal_name || '',
    kam: merchant.assigned_to_name || '',
    technician: '',
    country: merchant.country || '',
    currency: 'USD',
    pdf_language: 'Español',
    logo_validated: false,
    name_correct: false,
    info_comments: '',
    // Límites
    min_amount: '',
    max_amount: '',
    daily_limit: '',
    monthly_limit: '',
    limits_comments: '',
    // Transacciones
    pay_in_tested: false,
    pay_out_tested: false,
    refund_tested: false,
    partial_refund_tested: false,
    transactions_comments: '',
    // Métodos de Pago
    methods_configured: '',
    methods_tested: '',
    methods_comments: '',
    // UX
    redirect_correct: false,
    error_handling: false,
    success_page: false,
    mobile_responsive: false,
    ux_comments: '',
    // Rendimiento
    avg_response_time: '',
    timeout_handling: false,
    retry_logic: false,
    performance_comments: '',
    // Comentarios generales
    general_comments: '',
    recommendations: '',
    // Imágenes
    screenshots: [] as string[],
  });

  const set = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));

  const handleGeneratePDF = () => {
    // Crear contenido para imprimir
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
      <head>
        <title>Certificación - ${form.merchant_name}</title>
        <style>
          body { font-family: 'Inter', sans-serif; padding: 40px; color: #111; }
          h1 { color: #FC2B5F; font-size: 24px; }
          h2 { color: #374151; font-size: 18px; margin-top: 24px; border-bottom: 1px solid #E5E7EB; padding-bottom: 8px; }
          .field { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #F3F4F6; }
          .label { color: #6B7280; }
          .value { font-weight: 600; }
          .check { color: #16A34A; }
          .uncheck { color: #DC2626; }
          .header { display: flex; align-items: center; gap: 16px; margin-bottom: 32px; }
          .logo { height: 40px; }
          .env-badge { background: ${env === 'sandbox' ? '#FEF3C7' : '#D1FAE5'}; color: ${env === 'sandbox' ? '#92400E' : '#065F46'}; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="https://certificaciones.emprendepago.com/logo-prontopaga.png" class="logo" alt="ProntoPaga" />
          <div>
            <h1 style="margin:0">Certificación de Integraciones</h1>
            <span class="env-badge">${env === 'sandbox' ? 'Ambiente Sandbox' : 'Ambiente Productivo'}</span>
          </div>
        </div>
        <h2>Información Básica</h2>
        <div class="field"><span class="label">Fecha de revisión</span><span class="value">${form.review_date}</span></div>
        <div class="field"><span class="label">Nombre del Comercio</span><span class="value">${form.merchant_name}</span></div>
        <div class="field"><span class="label">KAM</span><span class="value">${form.kam}</span></div>
        <div class="field"><span class="label">Técnico</span><span class="value">${form.technician}</span></div>
        <div class="field"><span class="label">País</span><span class="value">${form.country}</span></div>
        <div class="field"><span class="label">Moneda</span><span class="value">${form.currency}</span></div>
        <div class="field"><span class="label">Logo Validado</span><span class="${form.logo_validated ? 'check' : 'uncheck'}">${form.logo_validated ? '✅ Sí' : '❌ No'}</span></div>
        <div class="field"><span class="label">Nombre Correcto</span><span class="${form.name_correct ? 'check' : 'uncheck'}">${form.name_correct ? '✅ Sí' : '❌ No'}</span></div>
        ${form.info_comments ? `<p><strong>Comentarios:</strong> ${form.info_comments}</p>` : ''}
        <h2>Límites</h2>
        <div class="field"><span class="label">Monto mínimo</span><span class="value">${form.min_amount || '—'}</span></div>
        <div class="field"><span class="label">Monto máximo</span><span class="value">${form.max_amount || '—'}</span></div>
        <div class="field"><span class="label">Límite diario</span><span class="value">${form.daily_limit || '—'}</span></div>
        <div class="field"><span class="label">Límite mensual</span><span class="value">${form.monthly_limit || '—'}</span></div>
        ${form.limits_comments ? `<p><strong>Comentarios:</strong> ${form.limits_comments}</p>` : ''}
        <h2>Transacciones</h2>
        <div class="field"><span class="label">Pay-In probado</span><span class="${form.pay_in_tested ? 'check' : 'uncheck'}">${form.pay_in_tested ? '✅ Sí' : '❌ No'}</span></div>
        <div class="field"><span class="label">Pay-Out probado</span><span class="${form.pay_out_tested ? 'check' : 'uncheck'}">${form.pay_out_tested ? '✅ Sí' : '❌ No'}</span></div>
        <div class="field"><span class="label">Reembolso probado</span><span class="${form.refund_tested ? 'check' : 'uncheck'}">${form.refund_tested ? '✅ Sí' : '❌ No'}</span></div>
        <div class="field"><span class="label">Reembolso parcial</span><span class="${form.partial_refund_tested ? 'check' : 'uncheck'}">${form.partial_refund_tested ? '✅ Sí' : '❌ No'}</span></div>
        ${form.transactions_comments ? `<p><strong>Comentarios:</strong> ${form.transactions_comments}</p>` : ''}
        <h2>Métodos de Pago</h2>
        <div class="field"><span class="label">Métodos configurados</span><span class="value">${form.methods_configured || '—'}</span></div>
        <div class="field"><span class="label">Métodos probados</span><span class="value">${form.methods_tested || '—'}</span></div>
        ${form.methods_comments ? `<p><strong>Comentarios:</strong> ${form.methods_comments}</p>` : ''}
        <h2>UX</h2>
        <div class="field"><span class="label">Redirección correcta</span><span class="${form.redirect_correct ? 'check' : 'uncheck'}">${form.redirect_correct ? '✅ Sí' : '❌ No'}</span></div>
        <div class="field"><span class="label">Manejo de errores</span><span class="${form.error_handling ? 'check' : 'uncheck'}">${form.error_handling ? '✅ Sí' : '❌ No'}</span></div>
        <div class="field"><span class="label">Página de éxito</span><span class="${form.success_page ? 'check' : 'uncheck'}">${form.success_page ? '✅ Sí' : '❌ No'}</span></div>
        <div class="field"><span class="label">Mobile responsive</span><span class="${form.mobile_responsive ? 'check' : 'uncheck'}">${form.mobile_responsive ? '✅ Sí' : '❌ No'}</span></div>
        ${form.ux_comments ? `<p><strong>Comentarios:</strong> ${form.ux_comments}</p>` : ''}
        <h2>Rendimiento</h2>
        <div class="field"><span class="label">Tiempo respuesta promedio</span><span class="value">${form.avg_response_time || '—'}</span></div>
        <div class="field"><span class="label">Manejo de timeout</span><span class="${form.timeout_handling ? 'check' : 'uncheck'}">${form.timeout_handling ? '✅ Sí' : '❌ No'}</span></div>
        <div class="field"><span class="label">Lógica de reintentos</span><span class="${form.retry_logic ? 'check' : 'uncheck'}">${form.retry_logic ? '✅ Sí' : '❌ No'}</span></div>
        ${form.performance_comments ? `<p><strong>Comentarios:</strong> ${form.performance_comments}</p>` : ''}
        <h2>Comentarios Generales</h2>
        <p>${form.general_comments || 'Sin comentarios'}</p>
        ${form.recommendations ? `<h2>Recomendaciones</h2><p>${form.recommendations}</p>` : ''}
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  const ic = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-pink-400';
  const lc = 'block text-xs font-medium text-gray-600 mb-1';
  const checkClass = 'w-4 h-4 rounded border-gray-300 text-pink-500 focus:ring-pink-400';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-4">
            <img src="https://certificaciones.emprendepago.com/logo-prontopaga.png" alt="ProntoPaga" className="h-8" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Certificación de Integraciones</h3>
              <p className="text-xs text-gray-500">Sistema avanzado de certificación digital para APIs</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleGeneratePDF} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50">
              <Eye className="w-3.5 h-3.5" /> Vista previa
            </button>
            <button onClick={handleGeneratePDF} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-white" style={{ background: '#FC2B5F' }}>
              <Download className="w-3.5 h-3.5" /> Generar PDF
            </button>
            <button onClick={onClose} className="ml-2 text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Environment toggle */}
        <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-2">
          <button
            onClick={() => setEnv('sandbox')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${env === 'sandbox' ? 'bg-amber-100 text-amber-800' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            Ambiente Sandbox
          </button>
          <button
            onClick={() => setEnv('production')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${env === 'production' ? 'bg-emerald-100 text-emerald-800' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            Ambiente Productivo
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar tabs */}
          <div className="w-48 border-r border-gray-100 overflow-y-auto py-2">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors ${
                  activeTab === tab.key ? 'bg-pink-50 text-pink-700 font-medium border-r-2 border-pink-500' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'info' && (
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900">Información Básica</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className={lc}>Fecha de revisión</label><input type="date" className={ic} value={form.review_date} onChange={e => set('review_date', e.target.value)} /></div>
                  <div><label className={lc}>Nombre del Comercio</label><input className={ic} value={form.merchant_name} onChange={e => set('merchant_name', e.target.value)} /></div>
                  <div><label className={lc}>KAM</label>
                    <select className={ic} value={form.kam} onChange={e => set('kam', e.target.value)}>
                      <option value="">Seleccionar</option>
                      {commercials.map(u => <option key={u.id} value={`${u.first_name} ${u.last_name}`}>{u.first_name} {u.last_name}</option>)}
                    </select>
                  </div>
                  <div><label className={lc}>Técnico</label>
                    <select className={ic} value={form.technician} onChange={e => set('technician', e.target.value)}>
                      <option value="">Seleccionar</option>
                      {onboardingUsers.map(u => <option key={u.id} value={`${u.first_name} ${u.last_name}`}>{u.first_name} {u.last_name}</option>)}
                    </select>
                  </div>
                  <div><label className={lc}>País</label><input className={ic} value={form.country} onChange={e => set('country', e.target.value)} /></div>
                  <div><label className={lc}>Moneda</label><input className={ic} value={form.currency} onChange={e => set('currency', e.target.value)} /></div>
                  <div><label className={lc}>Idioma PDF</label>
                    <select className={ic} value={form.pdf_language} onChange={e => set('pdf_language', e.target.value)}>
                      <option>Español</option><option>English</option><option>Português</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-6 pt-2">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className={checkClass} checked={form.logo_validated} onChange={e => set('logo_validated', e.target.checked)} /> Logo Validado</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className={checkClass} checked={form.name_correct} onChange={e => set('name_correct', e.target.checked)} /> Nombre Correcto</label>
                </div>
                <div><label className={lc}>Comentarios sobre información básica</label><textarea className={ic + ' h-20 resize-none'} value={form.info_comments} onChange={e => set('info_comments', e.target.value)} /></div>
              </div>
            )}

            {activeTab === 'limits' && (
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900">Límites</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className={lc}>Monto mínimo</label><input type="number" className={ic} value={form.min_amount} onChange={e => set('min_amount', e.target.value)} placeholder="0.00" /></div>
                  <div><label className={lc}>Monto máximo</label><input type="number" className={ic} value={form.max_amount} onChange={e => set('max_amount', e.target.value)} placeholder="0.00" /></div>
                  <div><label className={lc}>Límite diario</label><input type="number" className={ic} value={form.daily_limit} onChange={e => set('daily_limit', e.target.value)} placeholder="0.00" /></div>
                  <div><label className={lc}>Límite mensual</label><input type="number" className={ic} value={form.monthly_limit} onChange={e => set('monthly_limit', e.target.value)} placeholder="0.00" /></div>
                </div>
                <div><label className={lc}>Comentarios</label><textarea className={ic + ' h-20 resize-none'} value={form.limits_comments} onChange={e => set('limits_comments', e.target.value)} /></div>
              </div>
            )}

            {activeTab === 'transactions' && (
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900">Transacciones</h4>
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className={checkClass} checked={form.pay_in_tested} onChange={e => set('pay_in_tested', e.target.checked)} /> Pay-In probado correctamente</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className={checkClass} checked={form.pay_out_tested} onChange={e => set('pay_out_tested', e.target.checked)} /> Pay-Out probado correctamente</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className={checkClass} checked={form.refund_tested} onChange={e => set('refund_tested', e.target.checked)} /> Reembolso total probado</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className={checkClass} checked={form.partial_refund_tested} onChange={e => set('partial_refund_tested', e.target.checked)} /> Reembolso parcial probado</label>
                </div>
                <div><label className={lc}>Comentarios</label><textarea className={ic + ' h-20 resize-none'} value={form.transactions_comments} onChange={e => set('transactions_comments', e.target.value)} /></div>
              </div>
            )}

            {activeTab === 'payments' && (
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900">Métodos de Pago</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className={lc}>Métodos configurados</label><textarea className={ic + ' h-24 resize-none'} value={form.methods_configured} onChange={e => set('methods_configured', e.target.value)} placeholder="Visa, Mastercard, Transferencia..." /></div>
                  <div><label className={lc}>Métodos probados</label><textarea className={ic + ' h-24 resize-none'} value={form.methods_tested} onChange={e => set('methods_tested', e.target.value)} placeholder="Visa, Mastercard..." /></div>
                </div>
                <div><label className={lc}>Comentarios</label><textarea className={ic + ' h-20 resize-none'} value={form.methods_comments} onChange={e => set('methods_comments', e.target.value)} /></div>
              </div>
            )}

            {activeTab === 'ux' && (
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900">UX</h4>
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className={checkClass} checked={form.redirect_correct} onChange={e => set('redirect_correct', e.target.checked)} /> Redirección correcta al checkout</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className={checkClass} checked={form.error_handling} onChange={e => set('error_handling', e.target.checked)} /> Manejo adecuado de errores</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className={checkClass} checked={form.success_page} onChange={e => set('success_page', e.target.checked)} /> Página de éxito configurada</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className={checkClass} checked={form.mobile_responsive} onChange={e => set('mobile_responsive', e.target.checked)} /> Mobile responsive</label>
                </div>
                <div><label className={lc}>Comentarios</label><textarea className={ic + ' h-20 resize-none'} value={form.ux_comments} onChange={e => set('ux_comments', e.target.value)} /></div>
              </div>
            )}

            {activeTab === 'performance' && (
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900">Rendimiento</h4>
                <div><label className={lc}>Tiempo de respuesta promedio (ms)</label><input type="number" className={ic + ' w-48'} value={form.avg_response_time} onChange={e => set('avg_response_time', e.target.value)} placeholder="200" /></div>
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className={checkClass} checked={form.timeout_handling} onChange={e => set('timeout_handling', e.target.checked)} /> Manejo correcto de timeout</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className={checkClass} checked={form.retry_logic} onChange={e => set('retry_logic', e.target.checked)} /> Lógica de reintentos implementada</label>
                </div>
                <div><label className={lc}>Comentarios</label><textarea className={ic + ' h-20 resize-none'} value={form.performance_comments} onChange={e => set('performance_comments', e.target.value)} /></div>
              </div>
            )}

            {activeTab === 'comments' && (
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900">Comentarios Generales</h4>
                <div><label className={lc}>Comentarios generales</label><textarea className={ic + ' h-32 resize-none'} value={form.general_comments} onChange={e => set('general_comments', e.target.value)} placeholder="Observaciones generales de la certificación..." /></div>
                <div><label className={lc}>Recomendaciones</label><textarea className={ic + ' h-32 resize-none'} value={form.recommendations} onChange={e => set('recommendations', e.target.value)} placeholder="Recomendaciones para el comercio..." /></div>
              </div>
            )}

            {activeTab === 'images' && (
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900">Imágenes / Screenshots</h4>
                <p className="text-sm text-gray-500">Adjunta capturas de pantalla de las pruebas realizadas.</p>
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    id="cert-images"
                    onChange={e => {
                      const files = e.target.files;
                      if (!files) return;
                      Array.from(files).forEach(file => {
                        const reader = new FileReader();
                        reader.onload = () => {
                          set('screenshots', [...form.screenshots, reader.result as string]);
                        };
                        reader.readAsDataURL(file);
                      });
                    }}
                  />
                  <label htmlFor="cert-images" className="cursor-pointer">
                    <p className="text-sm text-gray-500">Click para subir imágenes</p>
                    <p className="text-xs text-gray-400 mt-1">PNG, JPG hasta 5MB</p>
                  </label>
                </div>
                {form.screenshots.length > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    {form.screenshots.map((src, i) => (
                      <div key={i} className="relative group">
                        <img src={src} alt={`Screenshot ${i + 1}`} className="w-full h-32 object-cover rounded-lg border border-gray-200" />
                        <button
                          onClick={() => set('screenshots', form.screenshots.filter((_, idx) => idx !== i))}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
