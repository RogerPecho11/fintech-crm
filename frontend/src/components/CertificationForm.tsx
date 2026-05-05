import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Eye, Download, Plus, Upload } from 'lucide-react';
import { Merchant, User } from '../types';
import { getActiveCountries } from '../lib/countries';
import api from '../lib/api';
import toast from 'react-hot-toast';

interface Props {
  merchant: Merchant;
  onClose: () => void;
}

type TabKey = 'info' | 'limits' | 'transactions' | 'payments' | 'ux' | 'performance' | 'comments' | 'images';
type Environment = 'sandbox' | 'production';
type TriState = '' | 'si' | 'no' | 'parcial';

interface Transaction {
  id: string;
  type: string;
  payment_method: string;
  status: string;
  order_id: string;
  uid: string;
  screenshots: string[];
}

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

const TRANSACTION_TYPES = ['Pay-In', 'Pay-Out', 'Reembolso Total', 'Reembolso Parcial', 'Verificación', 'Otro'];
const TRANSACTION_STATUSES = ['Exitosa', 'Fallida', 'Pendiente', 'Cancelada'];

// Translations
const LABELS: Record<string, Record<string, string>> = {
  es: {
    title: 'Certificación de Integraciones',
    subtitle: 'Sistema avanzado de certificación digital para APIs',
    sandbox: 'Ambiente Sandbox', production: 'Ambiente Productivo',
    review_date: 'Fecha de revisión', merchant_name: 'Nombre del Comercio',
    kam: 'KAM', technician: 'Técnico', country: 'País', currency: 'Moneda',
    logo_validated: 'Logo Validado', name_correct: 'Nombre Correcto',
    comments: 'Comentarios', limits: 'Límites', min_amount: 'Monto mínimo',
    max_amount: 'Monto máximo', daily_limit: 'Límite diario', monthly_limit: 'Límite mensual',
    transactions: 'Transacciones', type: 'Tipo', payment_method: 'Método de Pago',
    status: 'Estado', order_id: 'Order ID', uid: 'UID', screenshots: 'Capturas',
    payments: 'Métodos de Pago', visibility: 'Visibilidad', availability: 'Disponibilidad',
    logos_names: 'Logos y Nombres', mobile_compat: 'Compatibilidad Móvil',
    ux: 'UX', redirect: 'Redirección correcta', error_handling: 'Manejo de errores',
    success_page: 'Página de éxito', mobile_responsive: 'Mobile responsive',
    performance: 'Rendimiento', avg_response: 'Tiempo respuesta promedio',
    timeout: 'Manejo de timeout', retry: 'Lógica de reintentos',
    general_comments: 'Comentarios Generales', recommendations: 'Recomendaciones',
    yes: 'Sí', no: 'No', partial: 'Parcial', generate_pdf: 'Generar PDF', preview: 'Vista previa',
  },
  en: {
    title: 'Integration Certification',
    subtitle: 'Advanced digital certification system for APIs',
    sandbox: 'Sandbox Environment', production: 'Production Environment',
    review_date: 'Review Date', merchant_name: 'Merchant Name',
    kam: 'KAM', technician: 'Technician', country: 'Country', currency: 'Currency',
    logo_validated: 'Logo Validated', name_correct: 'Name Correct',
    comments: 'Comments', limits: 'Limits', min_amount: 'Minimum Amount',
    max_amount: 'Maximum Amount', daily_limit: 'Daily Limit', monthly_limit: 'Monthly Limit',
    transactions: 'Transactions', type: 'Type', payment_method: 'Payment Method',
    status: 'Status', order_id: 'Order ID', uid: 'UID', screenshots: 'Screenshots',
    payments: 'Payment Methods', visibility: 'Visibility', availability: 'Availability',
    logos_names: 'Logos & Names', mobile_compat: 'Mobile Compatibility',
    ux: 'UX', redirect: 'Correct Redirect', error_handling: 'Error Handling',
    success_page: 'Success Page', mobile_responsive: 'Mobile Responsive',
    performance: 'Performance', avg_response: 'Average Response Time',
    timeout: 'Timeout Handling', retry: 'Retry Logic',
    general_comments: 'General Comments', recommendations: 'Recommendations',
    yes: 'Yes', no: 'No', partial: 'Partial', generate_pdf: 'Generate PDF', preview: 'Preview',
  },
  pt: {
    title: 'Certificação de Integrações',
    subtitle: 'Sistema avançado de certificação digital para APIs',
    sandbox: 'Ambiente Sandbox', production: 'Ambiente Produtivo',
    review_date: 'Data de revisão', merchant_name: 'Nome do Comércio',
    kam: 'KAM', technician: 'Técnico', country: 'País', currency: 'Moeda',
    logo_validated: 'Logo Validado', name_correct: 'Nome Correto',
    comments: 'Comentários', limits: 'Limites', min_amount: 'Valor mínimo',
    max_amount: 'Valor máximo', daily_limit: 'Limite diário', monthly_limit: 'Limite mensal',
    transactions: 'Transações', type: 'Tipo', payment_method: 'Método de Pagamento',
    status: 'Status', order_id: 'Order ID', uid: 'UID', screenshots: 'Capturas',
    payments: 'Métodos de Pagamento', visibility: 'Visibilidade', availability: 'Disponibilidade',
    logos_names: 'Logos e Nomes', mobile_compat: 'Compatibilidade Móvel',
    ux: 'UX', redirect: 'Redirecionamento correto', error_handling: 'Tratamento de erros',
    success_page: 'Página de sucesso', mobile_responsive: 'Mobile responsive',
    performance: 'Desempenho', avg_response: 'Tempo médio de resposta',
    timeout: 'Tratamento de timeout', retry: 'Lógica de retry',
    general_comments: 'Comentários Gerais', recommendations: 'Recomendações',
    yes: 'Sim', no: 'Não', partial: 'Parcial', generate_pdf: 'Gerar PDF', preview: 'Pré-visualização',
  },
};

export default function CertificationForm({ merchant, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('info');
  const [env, setEnv] = useState<Environment>('sandbox');
  const [showTxModal, setShowTxModal] = useState(false);
  const [generating, setGenerating] = useState(false);

  const countries = getActiveCountries();

  const { data: users } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
  });

  const commercials = (users || []).filter(u => u.role === 'commercial' || u.role === 'admin');
  const onboardingUsers = (users || []).filter(u => u.role === 'onboarding' || u.role === 'admin');

  const [form, setForm] = useState({
    review_date: new Date().toISOString().split('T')[0],
    merchant_name: merchant.trade_name || merchant.legal_name || '',
    kam: merchant.assigned_to_name || '',
    technician: '',
    country: merchant.country || '',
    currency: '',
    pdf_language: 'es',
    logo_validated: false,
    name_correct: false,
    info_comments: '',
    min_amount: '', max_amount: '', daily_limit: '', monthly_limit: '', limits_comments: '',
    // Payments
    visibility: '' as TriState,
    availability: '' as TriState,
    logos_names: '' as TriState,
    mobile_compat: '' as TriState,
    payments_comments: '',
    // UX
    redirect_correct: false, error_handling: false, success_page: false, mobile_responsive: false, ux_comments: '',
    // Performance
    avg_response_time: '', timeout_handling: false, retry_logic: false, performance_comments: '',
    // Comments
    general_comments: '', recommendations: '',
    // Global images
    global_screenshots: [] as string[],
  });

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [newTx, setNewTx] = useState<Omit<Transaction, 'id'>>({
    type: '', payment_method: '', status: '', order_id: '', uid: '', screenshots: [],
  });

  const set = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));
  const t = (key: string) => LABELS[form.pdf_language]?.[key] || LABELS.es[key] || key;

  // Auto-set currency when country changes
  const handleCountryChange = (countryCode: string) => {
    set('country', countryCode);
    const c = countries.find(ct => ct.code === countryCode || ct.name === countryCode);
    if (c) set('currency', `${c.currencyCode} (${c.currency})`);
  };

  const addTransaction = () => {
    if (!newTx.type) { toast.error('Selecciona un tipo de transacción'); return; }
    setTransactions(prev => [...prev, { ...newTx, id: crypto.randomUUID() }]);
    setNewTx({ type: '', payment_method: '', status: '', order_id: '', uid: '', screenshots: [] });
    setShowTxModal(false);
    toast.success('Transacción agregada');
  };

  const removeTransaction = (id: string) => {
    setTransactions(prev => prev.filter(tx => tx.id !== id));
  };

  const handleTxScreenshots = (files: FileList | null) => {
    if (!files) return;
    const remaining = 5 - newTx.screenshots.length;
    const toProcess = Array.from(files).slice(0, remaining);
    toProcess.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        setNewTx(prev => ({ ...prev, screenshots: [...prev.screenshots, reader.result as string] }));
      };
      reader.readAsDataURL(file);
    });
  };

  const handleGeneratePDF = async () => {
    setGenerating(true);
    try {
      const triLabel = (val: TriState) => val === 'si' ? t('yes') : val === 'no' ? t('no') : val === 'parcial' ? t('partial') : '—';
      const checkIcon = (val: boolean) => val ? '✅' : '❌';

      const txRows = transactions.map(tx => `
        <tr>
          <td style="padding:6px 8px;border:1px solid #E5E7EB;">${tx.type}</td>
          <td style="padding:6px 8px;border:1px solid #E5E7EB;">${tx.payment_method}</td>
          <td style="padding:6px 8px;border:1px solid #E5E7EB;">${tx.status}</td>
          <td style="padding:6px 8px;border:1px solid #E5E7EB;">${tx.order_id}</td>
          <td style="padding:6px 8px;border:1px solid #E5E7EB;">${tx.uid}</td>
        </tr>
      `).join('');

      const txImages = transactions.filter(tx => tx.screenshots.length > 0).map(tx => `
        <div style="margin-top:12px;">
          <p style="font-size:12px;color:#6B7280;">${tx.type} - ${tx.order_id}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${tx.screenshots.map(s => `<img src="${s}" style="width:150px;height:100px;object-fit:cover;border-radius:4px;border:1px solid #E5E7EB;" />`).join('')}
          </div>
        </div>
      `).join('');

      const html = `<html><head><title>${t('title')} - ${form.merchant_name}</title>
        <style>
          body{font-family:'Inter',sans-serif;padding:40px;color:#111;font-size:13px;}
          h1{color:#FC2B5F;font-size:22px;margin:0;}
          h2{color:#374151;font-size:16px;margin-top:28px;border-bottom:1px solid #E5E7EB;padding-bottom:6px;}
          .field{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #F3F4F6;}
          .label{color:#6B7280;} .value{font-weight:600;}
          .check{color:#16A34A;} .uncheck{color:#DC2626;}
          table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;}
          th{background:#F9FAFB;padding:8px;border:1px solid #E5E7EB;text-align:left;font-weight:600;}
          .env-badge{background:${env === 'sandbox' ? '#FEF3C7' : '#D1FAE5'};color:${env === 'sandbox' ? '#92400E' : '#065F46'};padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600;}
        </style></head><body>
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:28px;">
          <img src="https://certificaciones.emprendepago.com/logo-prontopaga.png" style="height:36px;" />
          <div><h1>${t('title')}</h1><span class="env-badge">${env === 'sandbox' ? t('sandbox') : t('production')}</span></div>
        </div>
        <h2>${t('review_date')}: ${form.review_date}</h2>
        <div class="field"><span class="label">${t('merchant_name')}</span><span class="value">${form.merchant_name}</span></div>
        <div class="field"><span class="label">${t('kam')}</span><span class="value">${form.kam}</span></div>
        <div class="field"><span class="label">${t('technician')}</span><span class="value">${form.technician}</span></div>
        <div class="field"><span class="label">${t('country')}</span><span class="value">${form.country}</span></div>
        <div class="field"><span class="label">${t('currency')}</span><span class="value">${form.currency}</span></div>
        <div class="field"><span class="label">${t('logo_validated')}</span><span class="${form.logo_validated ? 'check' : 'uncheck'}">${checkIcon(form.logo_validated)}</span></div>
        <div class="field"><span class="label">${t('name_correct')}</span><span class="${form.name_correct ? 'check' : 'uncheck'}">${checkIcon(form.name_correct)}</span></div>
        ${form.info_comments ? `<p><strong>${t('comments')}:</strong> ${form.info_comments}</p>` : ''}
        <h2>${t('limits')}</h2>
        <div class="field"><span class="label">${t('min_amount')}</span><span class="value">${form.min_amount || '—'}</span></div>
        <div class="field"><span class="label">${t('max_amount')}</span><span class="value">${form.max_amount || '—'}</span></div>
        <div class="field"><span class="label">${t('daily_limit')}</span><span class="value">${form.daily_limit || '—'}</span></div>
        <div class="field"><span class="label">${t('monthly_limit')}</span><span class="value">${form.monthly_limit || '—'}</span></div>
        ${form.limits_comments ? `<p><strong>${t('comments')}:</strong> ${form.limits_comments}</p>` : ''}
        <h2>${t('transactions')} (${transactions.length})</h2>
        ${transactions.length > 0 ? `<table><thead><tr><th>${t('type')}</th><th>${t('payment_method')}</th><th>${t('status')}</th><th>Order ID</th><th>UID</th></tr></thead><tbody>${txRows}</tbody></table>` : '<p style="color:#9CA3AF;">Sin transacciones registradas</p>'}
        ${txImages}
        <h2>${t('payments')}</h2>
        <div class="field"><span class="label">${t('visibility')}</span><span class="value">${triLabel(form.visibility)}</span></div>
        <div class="field"><span class="label">${t('availability')}</span><span class="value">${triLabel(form.availability)}</span></div>
        <div class="field"><span class="label">${t('logos_names')}</span><span class="value">${triLabel(form.logos_names)}</span></div>
        <div class="field"><span class="label">${t('mobile_compat')}</span><span class="value">${triLabel(form.mobile_compat)}</span></div>
        ${form.payments_comments ? `<p><strong>${t('comments')}:</strong> ${form.payments_comments}</p>` : ''}
        <h2>${t('ux')}</h2>
        <div class="field"><span class="label">${t('redirect')}</span><span class="${form.redirect_correct ? 'check' : 'uncheck'}">${checkIcon(form.redirect_correct)}</span></div>
        <div class="field"><span class="label">${t('error_handling')}</span><span class="${form.error_handling ? 'check' : 'uncheck'}">${checkIcon(form.error_handling)}</span></div>
        <div class="field"><span class="label">${t('success_page')}</span><span class="${form.success_page ? 'check' : 'uncheck'}">${checkIcon(form.success_page)}</span></div>
        <div class="field"><span class="label">${t('mobile_responsive')}</span><span class="${form.mobile_responsive ? 'check' : 'uncheck'}">${checkIcon(form.mobile_responsive)}</span></div>
        ${form.ux_comments ? `<p><strong>${t('comments')}:</strong> ${form.ux_comments}</p>` : ''}
        <h2>${t('performance')}</h2>
        <div class="field"><span class="label">${t('avg_response')}</span><span class="value">${form.avg_response_time ? form.avg_response_time + 'ms' : '—'}</span></div>
        <div class="field"><span class="label">${t('timeout')}</span><span class="${form.timeout_handling ? 'check' : 'uncheck'}">${checkIcon(form.timeout_handling)}</span></div>
        <div class="field"><span class="label">${t('retry')}</span><span class="${form.retry_logic ? 'check' : 'uncheck'}">${checkIcon(form.retry_logic)}</span></div>
        ${form.performance_comments ? `<p><strong>${t('comments')}:</strong> ${form.performance_comments}</p>` : ''}
        <h2>${t('general_comments')}</h2>
        <p>${form.general_comments || '—'}</p>
        ${form.recommendations ? `<h2>${t('recommendations')}</h2><p>${form.recommendations}</p>` : ''}
      </body></html>`;

      // Create blob and upload as document
      const blob = new Blob([html], { type: 'text/html' });
      const file = new File([blob], `certificacion_${form.merchant_name.replace(/\s+/g, '_')}_${env}.html`, { type: 'text/html' });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('document_type', 'certification');
      formData.append('description', `Certificación ${env === 'sandbox' ? 'Sandbox' : 'Productivo'} - ${form.review_date}`);

      await api.post(`/documents/merchant/${merchant.id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Also open print preview
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 500);
      }

      toast.success('Certificación generada y guardada en documentos');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al generar certificación');
    } finally {
      setGenerating(false);
    }
  };

  const ic = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-pink-400';
  const lc = 'block text-xs font-medium text-gray-600 mb-1';
  const checkClass = 'w-4 h-4 rounded border-gray-300 text-pink-500 focus:ring-pink-400';
  const triSelect = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-200';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-4">
            <img src="https://certificaciones.emprendepago.com/logo-prontopaga.png" alt="ProntoPaga" className="h-8" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{t('title')}</h3>
              <p className="text-xs text-gray-500">{t('subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleGeneratePDF} disabled={generating} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-white disabled:opacity-50" style={{ background: '#FC2B5F' }}>
              <Download className="w-3.5 h-3.5" /> {generating ? 'Generando...' : t('generate_pdf')}
            </button>
            <button onClick={onClose} className="ml-2 text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Environment toggle */}
        <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-2">
          <button onClick={() => setEnv('sandbox')} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${env === 'sandbox' ? 'bg-amber-100 text-amber-800' : 'text-gray-500 hover:bg-gray-100'}`}>{t('sandbox')}</button>
          <button onClick={() => setEnv('production')} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${env === 'production' ? 'bg-emerald-100 text-emerald-800' : 'text-gray-500 hover:bg-gray-100'}`}>{t('production')}</button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-48 border-r border-gray-100 overflow-y-auto py-2">
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors ${activeTab === tab.key ? 'bg-pink-50 text-pink-700 font-medium border-r-2 border-pink-500' : 'text-gray-600 hover:bg-gray-50'}`}>
                <span>{tab.icon}</span><span>{tab.label}</span>
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
                  <div><label className={lc}>País</label>
                    <select className={ic} value={form.country} onChange={e => handleCountryChange(e.target.value)}>
                      <option value="">Seleccionar</option>
                      {countries.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                    </select>
                  </div>
                  <div><label className={lc}>Moneda</label><input className={ic} value={form.currency} readOnly placeholder="Se asigna al seleccionar país" /></div>
                  <div><label className={lc}>Idioma PDF</label>
                    <select className={ic} value={form.pdf_language} onChange={e => set('pdf_language', e.target.value)}>
                      <option value="es">Español</option>
                      <option value="en">English</option>
                      <option value="pt">Português</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-6 pt-2">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className={checkClass} checked={form.logo_validated} onChange={e => set('logo_validated', e.target.checked)} /> Logo Validado</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className={checkClass} checked={form.name_correct} onChange={e => set('name_correct', e.target.checked)} /> Nombre Correcto</label>
                </div>
                <div><label className={lc}>Comentarios</label><textarea className={ic + ' h-20 resize-none'} value={form.info_comments} onChange={e => set('info_comments', e.target.value)} /></div>
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
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-gray-900">Transacciones ({transactions.length})</h4>
                  <button onClick={() => setShowTxModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-white" style={{ background: '#FC2B5F' }}>
                    <Plus className="w-3.5 h-3.5" /> Agregar transacción
                  </button>
                </div>
                {transactions.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No hay transacciones registradas. Haz click en "Agregar transacción".</p>
                ) : (
                  <div className="space-y-3">
                    {transactions.map((tx, i) => (
                      <div key={tx.id} className="border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-800">#{i + 1} — {tx.type}</span>
                          <button onClick={() => removeTransaction(tx.id)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-xs text-gray-600">
                          <div><span className="text-gray-400">Método:</span> {tx.payment_method || '—'}</div>
                          <div><span className="text-gray-400">Estado:</span> {tx.status || '—'}</div>
                          <div><span className="text-gray-400">Order ID:</span> {tx.order_id || '—'}</div>
                          <div><span className="text-gray-400">UID:</span> {tx.uid || '—'}</div>
                        </div>
                        {tx.screenshots.length > 0 && (
                          <div className="flex gap-2 mt-2">
                            {tx.screenshots.map((s, j) => <img key={j} src={s} className="w-16 h-12 object-cover rounded border border-gray-200" />)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'payments' && (
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900">Métodos de Pago</h4>
                <fieldset className="border border-gray-200 rounded-lg p-4">
                  <legend className="text-xs font-medium text-gray-500 px-2">Evaluación de Presentación de Métodos de Pago</legend>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className={lc}>Visibilidad</label>
                      <select className={triSelect} value={form.visibility} onChange={e => set('visibility', e.target.value)}>
                        <option value="">Seleccionar</option><option value="si">Sí</option><option value="no">No</option><option value="parcial">Parcial</option>
                      </select>
                    </div>
                    <div><label className={lc}>Disponibilidad</label>
                      <select className={triSelect} value={form.availability} onChange={e => set('availability', e.target.value)}>
                        <option value="">Seleccionar</option><option value="si">Sí</option><option value="no">No</option><option value="parcial">Parcial</option>
                      </select>
                    </div>
                    <div><label className={lc}>Logos y Nombres</label>
                      <select className={triSelect} value={form.logos_names} onChange={e => set('logos_names', e.target.value)}>
                        <option value="">Seleccionar</option><option value="si">Sí</option><option value="no">No</option><option value="parcial">Parcial</option>
                      </select>
                    </div>
                    <div><label className={lc}>Compatibilidad Móvil</label>
                      <select className={triSelect} value={form.mobile_compat} onChange={e => set('mobile_compat', e.target.value)}>
                        <option value="">Seleccionar</option><option value="si">Sí</option><option value="no">No</option><option value="parcial">Parcial</option>
                      </select>
                    </div>
                  </div>
                </fieldset>
                <div><label className={lc}>Comentarios sobre métodos de pago</label><textarea className={ic + ' h-20 resize-none'} value={form.payments_comments} onChange={e => set('payments_comments', e.target.value)} /></div>
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
                <div><label className={lc}>Comentarios generales</label><textarea className={ic + ' h-32 resize-none'} value={form.general_comments} onChange={e => set('general_comments', e.target.value)} /></div>
                <div><label className={lc}>Recomendaciones</label><textarea className={ic + ' h-32 resize-none'} value={form.recommendations} onChange={e => set('recommendations', e.target.value)} /></div>
              </div>
            )}

            {activeTab === 'images' && (
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900">Imágenes Generales</h4>
                <p className="text-sm text-gray-500">Capturas adicionales no asociadas a una transacción específica.</p>
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
                  <input type="file" accept="image/*" multiple className="hidden" id="cert-global-images"
                    onChange={e => {
                      const files = e.target.files;
                      if (!files) return;
                      Array.from(files).forEach(file => {
                        const reader = new FileReader();
                        reader.onload = () => set('global_screenshots', [...form.global_screenshots, reader.result as string]);
                        reader.readAsDataURL(file);
                      });
                    }} />
                  <label htmlFor="cert-global-images" className="cursor-pointer">
                    <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Haga clic para cargar las imágenes</p>
                    <p className="text-xs text-gray-400 mt-1">PNG, JPG o JPEG</p>
                  </label>
                </div>
                {form.global_screenshots.length > 0 && (
                  <div className="grid grid-cols-4 gap-3">
                    {form.global_screenshots.map((src, i) => (
                      <div key={i} className="relative group">
                        <img src={src} className="w-full h-24 object-cover rounded-lg border border-gray-200" />
                        <button onClick={() => set('global_screenshots', form.global_screenshots.filter((_, idx) => idx !== i))}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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

      {/* Transaction Modal */}
      {showTxModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">Agregar Nueva Transacción</h3>
              <button onClick={() => setShowTxModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={lc}>Tipo de Transacción</label>
                <select className={ic} value={newTx.type} onChange={e => setNewTx(p => ({ ...p, type: e.target.value }))}>
                  <option value="">Seleccionar</option>
                  {TRANSACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div><label className={lc}>Método de Pago</label><input className={ic} value={newTx.payment_method} onChange={e => setNewTx(p => ({ ...p, payment_method: e.target.value }))} /></div>
              <div><label className={lc}>Estado</label>
                <select className={ic} value={newTx.status} onChange={e => setNewTx(p => ({ ...p, status: e.target.value }))}>
                  <option value="">Seleccionar</option>
                  {TRANSACTION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div><label className={lc}>Order ID</label><input className={ic} value={newTx.order_id} onChange={e => setNewTx(p => ({ ...p, order_id: e.target.value }))} /></div>
              <div className="col-span-2"><label className={lc}>UID</label><input className={ic} value={newTx.uid} onChange={e => setNewTx(p => ({ ...p, uid: e.target.value }))} /></div>
            </div>
            <div className="mt-4">
              <label className={lc}>Capturas de Pantalla (máx. 5)</label>
              <div className="border-2 border-dashed border-pink-200 rounded-lg p-4 text-center">
                <input type="file" accept="image/*" multiple className="hidden" id="tx-screenshots" onChange={e => handleTxScreenshots(e.target.files)} />
                <label htmlFor="tx-screenshots" className="cursor-pointer">
                  <Upload className="w-6 h-6 text-pink-300 mx-auto mb-1" />
                  <p className="text-xs text-gray-500">Haga clic para cargar las imágenes</p>
                  <p className="text-xs text-gray-400">PNG, JPG o JPEG (MAX. 5 archivos)</p>
                </label>
              </div>
              {newTx.screenshots.length > 0 && (
                <div className="flex gap-2 mt-2">
                  {newTx.screenshots.map((s, i) => (
                    <div key={i} className="relative">
                      <img src={s} className="w-14 h-10 object-cover rounded border" />
                      <button onClick={() => setNewTx(p => ({ ...p, screenshots: p.screenshots.filter((_, idx) => idx !== i) }))}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px]">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowTxModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={addTransaction} className="flex-1 px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ background: '#FC2B5F' }}>Agregar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
