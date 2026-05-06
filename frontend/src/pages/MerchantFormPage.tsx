import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Save, ArrowLeft, Plus, X, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { getActiveCountries } from '../lib/countries';
import { getStatuses, getRiskLevels, getPaymentMethodsForCountry, getMccCodes, getBusinessTypes, getIndustries, getCategories, useConfigRefresh } from '../lib/config';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymentMethodEntry {
  method_id: string;
  method_name: string;
  provider: string;
  commission: string;
  fee: string;
  min_fee: string;
  currency: string;
}

interface Pay4UConfig {
  amount_over_fee: string;
  currency: string;
  amount_between_fee: string;
  has_tax: boolean;
}

interface PaymentCountryConfig {
  country_code: string;
  country_name: string;
  pay_in: PaymentMethodEntry[];
  pay_out: PaymentMethodEntry[];
  pay4u: Pay4UConfig;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Datos Generales' },
  { id: 2, label: 'Contacto' },
  { id: 3, label: 'Pagos y Límites' },
  { id: 4, label: 'Estado y Config.' },
];

const defaultForm = {
  trade_name: '',
  request_type: '',
  contact_name: '',
  contact_phone: '',
  contact_email: '',
  contact_position: '',
  country: '',
  business_type: '',
  assigned_to: '',
  onboarding_assigned_to: '',
  notes: '',
  legal_name: '',
  merchant_email: '',
  tax_id: '',
  address: '',
  website: '',
  merchant_user: '',
  report_email: '',
  has_iva: '',
  accepts_third_party: '',
  communication_channel: '',
  category: '',
  industry: '',
  origin_country: '',
  mcc_code: '',
  mcc_description: '',
  secondary_contact_name: '',
  secondary_contact_email: '',
  secondary_contact_phone: '',
  status: 'lead',
  risk_level: 'diamond',
  payment_config: [] as PaymentCountryConfig[],
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function MerchantFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useConfigRefresh();
  const isEdit = !!id;
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(defaultForm);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [addingCountryCode, setAddingCountryCode] = useState('');

  const activeCountries = getActiveCountries();
  const statuses = getStatuses();
  const riskLevels = getRiskLevels();
  const mccCodes = getMccCodes();
  const businessTypes = getBusinessTypes();
  const industries = getIndustries();
  const categories = getCategories();

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
  });

  const { data: merchant } = useQuery({
    queryKey: ['merchant', id],
    queryFn: () => api.get(`/merchants/${id}`).then(r => r.data),
    enabled: isEdit,
  });

  useEffect(() => {
    if (merchant) {
      // Parse _meta block from notes to restore extra fields
      let meta: Record<string, any> = {};
      let cleanNotes = merchant.notes || '';
      try {
        const match = cleanNotes.match(/^\{\"_meta\":true.*?\}(?:\n)?/s);
        if (match) {
          meta = JSON.parse(match[0].trim());
          cleanNotes = cleanNotes.replace(match[0], '').trim();
        }
      } catch { /* ignore */ }

      setForm({
        ...defaultForm,
        ...merchant,
        // Restore extra fields from meta
        request_type:          meta.request_type          || '',
        merchant_email:        meta.merchant_email        || '',
        merchant_user:         meta.merchant_user         || '',
        report_email:          meta.report_email          || '',
        has_iva:               meta.has_iva               || '',
        accepts_third_party:   meta.accepts_third_party   || '',
        communication_channel: meta.communication_channel || '',
        category:              meta.category              || '',
        origin_country:        meta.origin_country        || '',
        risk_level:            meta.risk_label || merchant.risk_level || 'diamond',
        notes:                 cleanNotes,
        assigned_to:    merchant.assigned_to || '',
        onboarding_assigned_to: merchant.onboarding_assigned_to || '',
        payment_config: Array.isArray(merchant.payment_methods_detail)
          ? merchant.payment_methods_detail
          : [],
      });
    }
  }, [merchant]);

  const mutation = useMutation({
    mutationFn: (data: any) =>
      isEdit ? api.put(`/merchants/${id}`, data) : api.post('/merchants', data),
    onSuccess: async (res) => {
      const merchantId = res.data.id;

      // Subir contrato si se adjuntó
      if (contractFile) {
        try {
          const formData = new FormData();
          formData.append('file', contractFile);
          formData.append('merchant_id', merchantId);
          formData.append('document_type', 'contract');
          formData.append('description', 'Contrato del comercio');
          formData.append('name', `Contrato - ${form.trade_name}`);
          await api.post('/documents/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        } catch {
          toast.error('Comercio creado pero error al subir contrato');
        }
      }

      queryClient.invalidateQueries({ queryKey: ['merchants'] });
      toast.success(isEdit ? 'Comercio actualizado' : 'Comercio registrado exitosamente');
      navigate(`/merchants/${merchantId}`);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Error al guardar');
    },
  });

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const set = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));

  const setPaymentConfig = (configs: PaymentCountryConfig[]) =>
    setForm(f => ({ ...f, payment_config: configs }));

  const addCountryConfig = () => {
    if (!addingCountryCode) return;
    const country = activeCountries.find(c => c.code === addingCountryCode);
    if (!country) return;
    if (form.payment_config.some(pc => pc.country_code === addingCountryCode)) {
      toast.error('Este país ya fue agregado');
      return;
    }
    setPaymentConfig([...form.payment_config, {
      country_code: country.code,
      country_name: country.name,
      pay_in: [],
      pay_out: [],
      pay4u: { amount_over_fee: '', currency: 'USD', amount_between_fee: '', has_tax: false },
    }]);
    setAddingCountryCode('');
  };

  const removeCountryConfig = (code: string) =>
    setPaymentConfig(form.payment_config.filter(pc => pc.country_code !== code));

  const updateCountryConfig = (code: string, updater: (pc: PaymentCountryConfig) => PaymentCountryConfig) =>
    setPaymentConfig(form.payment_config.map(pc => pc.country_code === code ? updater(pc) : pc));

  const addPaymentMethod = (countryCode: string, type: 'pay_in' | 'pay_out', methodId: string) => {
    const methods = getPaymentMethodsForCountry(countryCode, type);
    const method = methods.find(m => m.id === methodId);
    if (!method) return;
    updateCountryConfig(countryCode, pc => {
      if (pc[type].some(m => m.method_id === methodId)) return pc;
      return {
        ...pc,
        [type]: [...pc[type], {
          method_id: method.id, method_name: method.name,
          provider: '', commission: '', fee: '', min_fee: '', currency: 'USD',
        }],
      };
    });
  };

  const removePaymentMethod = (countryCode: string, type: 'pay_in' | 'pay_out', methodId: string) =>
    updateCountryConfig(countryCode, pc => ({ ...pc, [type]: pc[type].filter(m => m.method_id !== methodId) }));

  const updateMethodField = (
    countryCode: string, type: 'pay_in' | 'pay_out',
    methodId: string, field: keyof PaymentMethodEntry, value: string
  ) => updateCountryConfig(countryCode, pc => ({
    ...pc,
    [type]: pc[type].map(m => m.method_id === methodId ? { ...m, [field]: value } : m),
  }));

  const updatePay4u = (countryCode: string, field: keyof Pay4UConfig, value: any) =>
    updateCountryConfig(countryCode, pc => ({ ...pc, pay4u: { ...pc.pay4u, [field]: value } }));

  const handleSubmit = () => {
    // Validar campos obligatorios de Datos Generales
    const required: { field: keyof typeof form; label: string }[] = [
      { field: 'trade_name', label: 'Nombre del comercio' },
      { field: 'request_type', label: 'Tipo de solicitud' },
      { field: 'legal_name', label: 'Razón social' },
      { field: 'tax_id', label: 'RUT/DNI/RUC' },
      { field: 'country', label: 'País' },
      { field: 'business_type', label: 'Tipo comercio' },
      { field: 'category', label: 'Categoría del comercio' },
      { field: 'industry', label: 'Rubro' },
      { field: 'mcc_code', label: 'MCC' },
      { field: 'website', label: 'URL del comercio' },
      { field: 'address', label: 'Dirección' },
      { field: 'contact_name', label: 'Nombre de contacto' },
      { field: 'contact_email', label: 'Email de contacto' },
      { field: 'contact_phone', label: 'Teléfono de contacto' },
    ];

    const missing = required.filter(r => !form[r.field]?.toString().trim());
    if (missing.length > 0) {
      toast.error(`Campos obligatorios: ${missing.map(m => m.label).join(', ')}`, { duration: 5000 });
      setStep(1);
      return;
    }

    // Campos extra que no tienen columna propia en la DB
    // Se serializan en `notes` como bloque JSON _meta
    const metaBlock = JSON.stringify({
      _meta: true,
      request_type:          form.request_type,
      merchant_email:        form.merchant_email,
      merchant_user:         form.merchant_user,
      report_email:          form.report_email,
      has_iva:               form.has_iva,
      accepts_third_party:   form.accepts_third_party,
      communication_channel: form.communication_channel,
      category:              form.category,
      origin_country:        form.origin_country,
      risk_label:            form.risk_level,   // keep display label
    });

    // Preserve free-text notes (exclude any previous _meta block)
    const cleanNotes = (form.notes || '').replace(/^\{\"_meta\":true.*?\}\n?/s, '').trim();
    const combinedNotes = metaBlock + (cleanNotes ? '\n' + cleanNotes : '');

    const payload = {
      legal_name:   form.legal_name || form.trade_name,
      trade_name:   form.trade_name,
      tax_id:       form.tax_id,
      country:      activeCountries.find(c => c.code === form.country)?.name || form.country,
      address:      form.address,
      website:      form.website,
      mcc_code:     form.mcc_code,
      mcc_description: form.mcc_description,
      business_type:   form.business_type,
      industry:     form.industry,
      contact_name:  form.contact_name,
      contact_email: form.contact_email,
      contact_phone: form.contact_phone,
      contact_position: form.contact_position,
      secondary_contact_name:  form.secondary_contact_name,
      secondary_contact_email: form.secondary_contact_email,
      secondary_contact_phone: form.secondary_contact_phone,
      status:    form.status,
      risk_level: form.risk_level,
      assigned_to: form.assigned_to || null,
      onboarding_assigned_to: form.onboarding_assigned_to || null,
      notes: combinedNotes,
      payment_methods_detail: form.payment_config,
      accepts_credit_card: form.payment_config.some(pc => pc.pay_in.some(m => m.method_id.includes('card'))),
      accepts_debit_card:  false,
      accepts_ach:    form.payment_config.some(pc => pc.pay_in.some(m => m.method_id === 'ach')),
      accepts_wire:   form.payment_config.some(pc => pc.pay_in.some(m => m.method_id === 'wire')),
      accepts_crypto: form.payment_config.some(pc => pc.pay_in.some(m => m.method_id === 'crypto')),
      currency: 'USD',
      tags: [],
      ip_whitelist: [],
    };
    mutation.mutate(payload);
  };

  const ic = 'input';
  const lc = 'label';

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEdit ? 'Editar Comercio' : 'Registrar Comercio'}
          </h1>
          <p className="text-gray-500 text-sm">Paso {step} de {STEPS.length}</p>
        </div>
      </div>

      {/* Step indicators */}
      <div className="flex gap-2">
        {STEPS.map(s => (
          <button
            key={s.id}
            onClick={() => setStep(s.id)}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
              step > s.id ? 'bg-rose-50 text-rose-600' : step < s.id ? 'bg-gray-100 text-gray-400' : ''
            }`}
            style={step === s.id ? { backgroundColor: '#FC2B5F', color: 'white' } : undefined}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="card space-y-4">

        {/* ── STEP 1: Datos Generales ─────────────────────────────────────────── */}
        {step === 1 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900">Datos Generales</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <div>
                <label className={lc}>Nombre del comercio *</label>
                <input className={ic} value={form.trade_name} onChange={e => set('trade_name', e.target.value)} placeholder="Nombre de marca" />
              </div>

              <div>
                <label className={lc}>Tipo de solicitud *</label>
                <select className={ic} value={form.request_type} onChange={e => set('request_type', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option>Nuevo Comercio</option>
                  <option>Ampliación de Servicios</option>
                  <option>Renovación</option>
                  <option>Migración</option>
                </select>
              </div>

              <div>
                <label className={lc}>Razón social</label>
                <input className={ic} value={form.legal_name} onChange={e => set('legal_name', e.target.value)} placeholder="Empresa S.A." />
              </div>

              <div>
                <label className={lc}>RUT/DNI/RUC</label>
                <input className={ic} value={form.tax_id} onChange={e => set('tax_id', e.target.value)} placeholder="20123456789" />
              </div>

              <div>
                <label className={lc}>País *</label>
                <select className={ic} value={form.country} onChange={e => set('country', e.target.value)}>
                  <option value="">Seleccionar país</option>
                  {activeCountries.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                </select>
              </div>

              <div>
                <label className={lc}>País origen</label>
                <select className={ic} value={form.origin_country} onChange={e => set('origin_country', e.target.value)}>
                  <option value="">Seleccionar país</option>
                  {activeCountries.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                </select>
              </div>

              <div>
                <label className={lc}>Tipo comercio</label>
                <select className={ic} value={form.business_type} onChange={e => set('business_type', e.target.value)}>
                  <option value="">Seleccionar</option>
                  {businessTypes.map(v => <option key={v.value} value={v.label}>{v.label}</option>)}
                </select>
              </div>

              <div>
                <label className={lc}>Categoría del comercio</label>
                <select className={ic} value={form.category} onChange={e => set('category', e.target.value)}>
                  <option value="">Seleccionar</option>
                  {categories.map(c => <option key={c.value} value={c.label}>{c.label}</option>)}
                </select>
              </div>

              <div>
                <label className={lc}>Rubro</label>
                <select className={ic} value={form.industry} onChange={e => set('industry', e.target.value)}>
                  <option value="">Seleccionar</option>
                  {industries.map(ind => <option key={ind.value} value={ind.label}>{ind.label}</option>)}
                </select>
              </div>

              <div>
                <label className={lc}>MCC *</label>
                <select className={ic} value={form.mcc_code} onChange={e => {
                  const mcc = mccCodes.find(m => m.code === e.target.value);
                  set('mcc_code', e.target.value);
                  if (mcc) set('mcc_description', mcc.description);
                }}>
                  <option value="">Seleccionar MCC</option>
                  {mccCodes.map(m => <option key={m.code} value={m.code}>{m.code} - {m.description}</option>)}
                </select>
              </div>

              <div>
                <label className={lc}>URL del comercio</label>
                <input className={ic} value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://comercio.com" />
              </div>

              <div>
                <label className={lc}>Dirección</label>
                <input className={ic} value={form.address} onChange={e => set('address', e.target.value)} />
              </div>

              <div>
                <label className={lc}>Email comercio</label>
                <input type="email" className={ic} value={form.merchant_email} onChange={e => set('merchant_email', e.target.value)} />
              </div>

              <div>
                <label className={lc}>Usuario del comercio</label>
                <input className={ic} value={form.merchant_user} onChange={e => set('merchant_user', e.target.value)} />
              </div>

              <div>
                <label className={lc}>Email para reportes</label>
                <input type="email" className={ic} value={form.report_email} onChange={e => set('report_email', e.target.value)} />
              </div>

              <div>
                <label className={lc}>¿Va con IVA?</label>
                <select className={ic} value={form.has_iva} onChange={e => set('has_iva', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="yes">Sí</option>
                  <option value="no">No</option>
                </select>
              </div>

              <div>
                <label className={lc}>¿Acepta pagos de terceros?</label>
                <select className={ic} value={form.accepts_third_party} onChange={e => set('accepts_third_party', e.target.value)}>
                  <option value="">Seleccionar</option>
                  <option value="yes">Sí</option>
                  <option value="no">No</option>
                </select>
              </div>

              <div>
                <label className={lc}>Canal de comunicación</label>
                <select className={ic} value={form.communication_channel} onChange={e => set('communication_channel', e.target.value)}>
                  <option value="">Seleccionar</option>
                  {['Email','WhatsApp','Teléfono','Slack','Teams','Otro'].map(v => <option key={v}>{v}</option>)}
                </select>
              </div>

              <div>
                <label className={lc}>KAM</label>
                <select className={ic} value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}>
                  <option value="">Sin asignar</option>
                  {(users || []).map((u: any) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
                </select>
              </div>

              <div>
                <label className={lc}>Responsable de Onboarding</label>
                <select className={ic} value={form.onboarding_assigned_to} onChange={e => set('onboarding_assigned_to', e.target.value)}>
                  <option value="">Sin asignar</option>
                  {(users || []).filter((u: any) => u.role === 'onboarding' || u.role === 'admin').map((u: any) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className={lc}>Comentarios adicionales</label>
                <textarea className={`${ic} h-24 resize-none`} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Observaciones adicionales..." />
              </div>

              <div className="sm:col-span-2">
                <label className={lc}>Contrato (archivo adjunto)</label>
                <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
                  <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden" id="contract-file"
                    onChange={e => setContractFile(e.target.files?.[0] || null)} />
                  <label htmlFor="contract-file" className="cursor-pointer flex items-center justify-center gap-2">
                    <Plus className="w-5 h-5 text-gray-400" />
                    <span className="text-sm text-gray-600">{contractFile?.name || 'Click para subir contrato'}</span>
                  </label>
                </div>
              </div>

            </div>
          </>
        )}

        {/* ── STEP 2: Contacto ────────────────────────────────────────────────── */}
        {step === 2 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900">Contacto</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={lc}>Persona de contacto *</label><input className={ic} value={form.contact_name} onChange={e => set('contact_name', e.target.value)} /></div>
              <div><label className={lc}>Correo de contacto *</label><input type="email" className={ic} value={form.contact_email} onChange={e => set('contact_email', e.target.value)} /></div>
              <div><label className={lc}>Teléfono de contacto</label><input className={ic} value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} /></div>
              <div><label className={lc}>Cargo</label><input className={ic} value={form.contact_position} onChange={e => set('contact_position', e.target.value)} /></div>
              <div className="sm:col-span-2 pt-2 border-t border-gray-100">
                <p className="text-sm font-medium text-gray-500 mb-3">Contacto Secundario</p>
              </div>
              <div><label className={lc}>Nombre</label><input className={ic} value={form.secondary_contact_name} onChange={e => set('secondary_contact_name', e.target.value)} /></div>
              <div><label className={lc}>Email</label><input type="email" className={ic} value={form.secondary_contact_email} onChange={e => set('secondary_contact_email', e.target.value)} /></div>
              <div><label className={lc}>Teléfono</label><input className={ic} value={form.secondary_contact_phone} onChange={e => set('secondary_contact_phone', e.target.value)} /></div>
            </div>
          </>
        )}

        {/* ── STEP 3: Pagos y Límites ─────────────────────────────────────────── */}
        {step === 3 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900">Configuración de Métodos de Pago por País</h2>

            <div className="flex gap-2">
              <select className={`${ic} flex-1`} value={addingCountryCode} onChange={e => setAddingCountryCode(e.target.value)}>
                <option value="">Seleccionar país para agregar</option>
                {activeCountries.filter(c => !form.payment_config.some(pc => pc.country_code === c.code))
                  .map(c => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
              </select>
              <button type="button" onClick={addCountryConfig} disabled={!addingCountryCode}
                className="btn-primary flex items-center gap-1 whitespace-nowrap text-sm">
                <Plus className="w-4 h-4" /> Agregar País
              </button>
            </div>

            {form.payment_config.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">Agrega un país para configurar sus métodos de pago.</p>
            )}

            {form.payment_config.map(pc => {
              const countryObj = activeCountries.find(c => c.code === pc.country_code);
              const availPayIn  = getPaymentMethodsForCountry(pc.country_code, 'pay_in').filter(m => !pc.pay_in.some(e => e.method_id === m.id));
              const availPayOut = getPaymentMethodsForCountry(pc.country_code, 'pay_out').filter(m => !pc.pay_out.some(e => e.method_id === m.id));

              return (
                <div key={pc.country_code} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <span className="font-semibold text-gray-800 text-sm">{countryObj?.flag} {pc.country_name}</span>
                    <button type="button" onClick={() => removeCountryConfig(pc.country_code)} className="text-gray-400 hover:text-red-500 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* Pay In */}
                    <PaySection
                      title="Pay In"
                      entries={pc.pay_in}
                      available={availPayIn}
                      onAdd={mid => addPaymentMethod(pc.country_code, 'pay_in', mid)}
                      onRemove={mid => removePaymentMethod(pc.country_code, 'pay_in', mid)}
                      onUpdate={(mid, field, val) => updateMethodField(pc.country_code, 'pay_in', mid, field, val)}
                      ic={ic}
                    />

                    {/* Pay Out */}
                    <div className="space-y-3">
                      <PaySection
                        title="Pay Out"
                        entries={pc.pay_out}
                        available={availPayOut}
                        onAdd={mid => addPaymentMethod(pc.country_code, 'pay_out', mid)}
                        onRemove={mid => removePaymentMethod(pc.country_code, 'pay_out', mid)}
                        onUpdate={(mid, field, val) => updateMethodField(pc.country_code, 'pay_out', mid, field, val)}
                        ic={ic}
                      />

                      {/* Pay4U */}
                      <div className="border border-dashed border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
                        <h5 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Pay4U</h5>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-gray-500 mb-0.5 block">Monto sobre Tarifa</label>
                            <input type="number" className={ic} value={pc.pay4u.amount_over_fee} onChange={e => updatePay4u(pc.country_code, 'amount_over_fee', e.target.value)} placeholder="0.00" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 mb-0.5 block">Monto entre Tarifa</label>
                            <input type="number" className={ic} value={pc.pay4u.amount_between_fee} onChange={e => updatePay4u(pc.country_code, 'amount_between_fee', e.target.value)} placeholder="0.00" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 mb-0.5 block">Moneda</label>
                            <select className={ic} value={pc.pay4u.currency} onChange={e => updatePay4u(pc.country_code, 'currency', e.target.value)}>
                              <option>USD</option><option>PEN</option><option>CLP</option><option>EUR</option>
                            </select>
                          </div>
                          <div className="flex items-end pb-1">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={pc.pay4u.has_tax} onChange={e => updatePay4u(pc.country_code, 'has_tax', e.target.checked)} className="w-4 h-4 rounded border-gray-300" />
                              <span className="text-xs text-gray-600">+ Impuesto</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ── STEP 4: Estado y Config ─────────────────────────────────────────── */}
        {step === 4 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900">Estado y Configuración</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={lc}>Estado Inicial</label>
                <select className={ic} value={form.status} onChange={e => set('status', e.target.value)}>
                  {statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className={lc}>Nivel de Riesgo</label>
                <select className={ic} value={form.risk_level} onChange={e => set('risk_level', e.target.value)}>
                  {riskLevels.map(r => <option key={r.value} value={r.value}>{r.icon} {r.label}</option>)}
                </select>
              </div>
            </div>
          </>
        )}

      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}
          className="btn-secondary flex items-center gap-2 disabled:opacity-40">
          <ChevronLeft className="w-4 h-4" /> Anterior
        </button>
        {step < STEPS.length ? (
          <button type="button" onClick={() => setStep(s => Math.min(STEPS.length, s + 1))} className="btn-primary flex items-center gap-2">
            Siguiente <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button type="button" onClick={handleSubmit} disabled={mutation.isPending} className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" />
            {mutation.isPending ? 'Guardando...' : isEdit ? 'Actualizar' : 'Registrar Comercio'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── PaySection sub-component ─────────────────────────────────────────────────

interface PaySectionProps {
  title: string;
  entries: PaymentMethodEntry[];
  available: { id: string; name: string }[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, field: keyof PaymentMethodEntry, value: string) => void;
  ic: string;
}

function PaySection({ title, entries, available, onAdd, onRemove, onUpdate, ic }: PaySectionProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-700">{title}</h4>

      {available.length > 0 && (
        <select className={ic} value="" onChange={e => { if (e.target.value) onAdd(e.target.value); }}>
          <option value="">+ Agregar método</option>
          {available.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      )}

      {entries.length === 0 && <p className="text-xs text-gray-400">Sin métodos configurados.</p>}

      {entries.map(entry => (
        <div key={entry.method_id} className="border border-gray-100 rounded-lg p-3 space-y-2 bg-white">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">{entry.method_name}</span>
            <button type="button" onClick={() => onRemove(entry.method_id)} className="text-gray-300 hover:text-red-500 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">Comisión %</label>
              <input type="number" className={ic} value={entry.commission} onChange={e => onUpdate(entry.method_id, 'commission', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">Tarifa</label>
              <input type="number" className={ic} value={entry.fee} onChange={e => onUpdate(entry.method_id, 'fee', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">Tarifa fija/mín</label>
              <input type="number" className={ic} value={entry.min_fee} onChange={e => onUpdate(entry.method_id, 'min_fee', e.target.value)} placeholder="0.00" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-0.5 block">Moneda</label>
              <select className={ic} value={entry.currency} onChange={e => onUpdate(entry.method_id, 'currency', e.target.value)}>
                <option>USD</option><option>PEN</option><option>CLP</option><option>EUR</option>
              </select>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
