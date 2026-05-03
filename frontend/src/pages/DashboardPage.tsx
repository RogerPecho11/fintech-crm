import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  Building2, TrendingUp, Clock, AlertTriangle,
  ListTodo, Users, Activity, Globe, Plus, X, Settings, Shield, CreditCard, Trash2, Tag, Layers, FolderTree, Hash
} from 'lucide-react';
import { useState } from 'react';
import api from '../lib/api';
import { DashboardMetrics, STATUS_LABELS } from '../types';
import { timeAgo, scoreColor, scoreBarColor } from '../lib/utils';
import { Link } from 'react-router-dom';
import {
  getActiveCountries, saveActiveCountries, getAvailableToAdd,
  Country
} from '../lib/countries';
import {
  getStatuses, saveStatuses, getRiskLevels, saveRiskLevels,
  getPaymentMethods, savePaymentMethods,
  getMccCodes, saveMccCodes, getBusinessTypes, saveBusinessTypes,
  getIndustries, saveIndustries, getCategories, saveCategories,
  MerchantStatusConfig, RiskLevelConfig, PaymentMethod,
  MccCode, BusinessType, IndustryConfig, CategoryConfig,
  DEFAULT_STATUSES, DEFAULT_RISK_LEVELS,
} from '../lib/config';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import SlaPanel from '../components/SlaPanel';

const CHART_COLORS = ['#FC2B5F', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16'];

const TOOLTIP_STYLE = {
  contentStyle: {
    background: '#fff',
    border: '1px solid #E5E7EB',
    borderRadius: '10px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
    color: '#111827',
  },
  labelStyle: { color: '#374151', fontWeight: 600 },
};

function StatCard({ icon: Icon, label, value, sub, accent = false }: any) {
  return (
    <div className="card flex items-start gap-4">
      <div
        className="p-2.5 rounded-xl flex-shrink-0"
        style={{ backgroundColor: accent ? '#FC2B5F' : '#fff0f3' }}
      >
        <Icon className="w-5 h-5" style={{ color: accent ? '#fff' : '#FC2B5F' }} />
      </div>
      <div>
        <p className="text-gray-500 text-sm">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const isCommercial = user?.role === 'commercial';

  const [activeCountries, setActiveCountries] = useState<Country[]>(getActiveCountries);
  const [showCountryPanel, setShowCountryPanel] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  // Config state
  const [statuses, setStatuses] = useState<MerchantStatusConfig[]>(getStatuses);
  const [riskLevels, setRiskLevels] = useState<RiskLevelConfig[]>(getRiskLevels);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(getPaymentMethods);
  const [mccCodes, setMccCodes] = useState<MccCode[]>(getMccCodes);
  const [businessTypes, setBusinessTypes] = useState<BusinessType[]>(getBusinessTypes);
  const [industriesList, setIndustriesList] = useState<IndustryConfig[]>(getIndustries);
  const [categoriesList, setCategoriesList] = useState<CategoryConfig[]>(getCategories);
  const [activeConfigPanel, setActiveConfigPanel] = useState<'statuses' | 'risks' | 'payments' | 'mcc' | 'business_types' | 'industries' | 'categories' | null>(null);

  // New item forms
  const [newStatus, setNewStatus] = useState({ label: '', value: '', hex: '#6B7280' });
  const [newRisk, setNewRisk] = useState({ label: '', value: '', icon: '⭐', hex: '#6B7280' });
  const [newPayment, setNewPayment] = useState({ name: '', type: 'both' as 'pay_in' | 'pay_out' | 'both' });
  const [newMcc, setNewMcc] = useState({ code: '', description: '' });
  const [newBusinessType, setNewBusinessType] = useState('');
  const [newIndustry, setNewIndustry] = useState('');
  const [newCategory, setNewCategory] = useState('');

  const [teamRole, setTeamRole]         = useState('');
  const [teamDateFrom, setTeamDateFrom] = useState('');
  const [teamDateTo, setTeamDateTo]     = useState('');

  const availableToAdd = getAvailableToAdd(activeCountries).filter(c =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase())
  );

  const handleAddCountry = (country: Country) => {
    const updated = [...activeCountries, country];
    setActiveCountries(updated);
    saveActiveCountries(updated);
  };

  const handleRemoveCountry = (code: string) => {
    if (activeCountries.length <= 1) return;
    const updated = activeCountries.filter(c => c.code !== code);
    setActiveCountries(updated);
    saveActiveCountries(updated);
  };

  // Status management
  const handleAddStatus = () => {
    if (!newStatus.label.trim()) return;
    // Generate clean value: lowercase, spaces to underscore, trim trailing underscores
    const value = (newStatus.value || newStatus.label.toLowerCase().replace(/\s+/g, '_'))
      .trim().replace(/^_+|_+$/g, '');
    if (statuses.some(s => s.value === value)) {
      toast.error('Ya existe un estado con ese nombre');
      return;
    }
    const updated = [...statuses, { value, label: newStatus.label.trim(), color: 'bg-gray-100 text-gray-600', hex: newStatus.hex, isDefault: false }];
    setStatuses(updated);
    saveStatuses(updated);
    setNewStatus({ label: '', value: '', hex: '#6B7280' });
    toast.success('Estado agregado');
  };
  const handleRemoveStatus = (value: string) => {
    const updated = statuses.filter(s => s.value !== value);
    setStatuses(updated);
    saveStatuses(updated);
  };

  // Risk management
  const handleAddRisk = () => {
    if (!newRisk.label.trim()) return;
    const value = newRisk.value || newRisk.label.toLowerCase().replace(/\s+/g, '_');
    const updated = [...riskLevels, { value, label: newRisk.label, icon: newRisk.icon, color: 'bg-gray-100 text-gray-600', hex: newRisk.hex, isDefault: false }];
    setRiskLevels(updated);
    saveRiskLevels(updated);
    setNewRisk({ label: '', value: '', icon: '⭐', hex: '#6B7280' });
    toast.success('Nivel de riesgo agregado');
  };
  const handleRemoveRisk = (value: string) => {
    const updated = riskLevels.filter(r => r.value !== value);
    setRiskLevels(updated);
    saveRiskLevels(updated);
  };

  // Payment method management
  const handleAddPayment = () => {
    if (!newPayment.name.trim()) return;
    const id = 'custom_' + Date.now();
    const updated = [...paymentMethods, { id, name: newPayment.name, type: newPayment.type, countries: [] }];
    setPaymentMethods(updated);
    savePaymentMethods(updated);
    setNewPayment({ name: '', type: 'both' });
    toast.success('Método de pago agregado');
  };
  const handleRemovePayment = (id: string) => {
    const updated = paymentMethods.filter(m => m.id !== id);
    setPaymentMethods(updated);
    savePaymentMethods(updated);
  };

  // MCC management
  const handleAddMcc = () => {
    if (!newMcc.code.trim() || !newMcc.description.trim()) return;
    if (mccCodes.some(m => m.code === newMcc.code.trim())) {
      toast.error('Ya existe un MCC con ese código');
      return;
    }
    const updated = [...mccCodes, { code: newMcc.code.trim(), description: newMcc.description.trim() }];
    setMccCodes(updated);
    saveMccCodes(updated);
    setNewMcc({ code: '', description: '' });
    toast.success('Código MCC agregado');
  };
  const handleRemoveMcc = (code: string) => {
    const updated = mccCodes.filter(m => m.code !== code);
    setMccCodes(updated);
    saveMccCodes(updated);
  };

  // Business type management
  const handleAddBusinessType = () => {
    if (!newBusinessType.trim()) return;
    const value = newBusinessType.trim().toLowerCase().replace(/\s+/g, '_');
    if (businessTypes.some(b => b.value === value)) {
      toast.error('Ya existe ese tipo de comercio');
      return;
    }
    const updated = [...businessTypes, { value, label: newBusinessType.trim() }];
    setBusinessTypes(updated);
    saveBusinessTypes(updated);
    setNewBusinessType('');
    toast.success('Tipo de comercio agregado');
  };
  const handleRemoveBusinessType = (value: string) => {
    const updated = businessTypes.filter(b => b.value !== value);
    setBusinessTypes(updated);
    saveBusinessTypes(updated);
  };

  // Industry management
  const handleAddIndustry = () => {
    if (!newIndustry.trim()) return;
    const value = newIndustry.trim().toLowerCase().replace(/\s+/g, '_');
    if (industriesList.some(i => i.value === value)) {
      toast.error('Ya existe ese rubro');
      return;
    }
    const updated = [...industriesList, { value, label: newIndustry.trim() }];
    setIndustriesList(updated);
    saveIndustries(updated);
    setNewIndustry('');
    toast.success('Rubro agregado');
  };
  const handleRemoveIndustry = (value: string) => {
    const updated = industriesList.filter(i => i.value !== value);
    setIndustriesList(updated);
    saveIndustries(updated);
  };

  // Category management
  const handleAddCategory = () => {
    if (!newCategory.trim()) return;
    const value = newCategory.trim().toLowerCase().replace(/\s+/g, '_');
    if (categoriesList.some(c => c.value === value)) {
      toast.error('Ya existe esa categoría');
      return;
    }
    const updated = [...categoriesList, { value, label: newCategory.trim() }];
    setCategoriesList(updated);
    saveCategories(updated);
    setNewCategory('');
    toast.success('Categoría agregada');
  };
  const handleRemoveCategory = (value: string) => {
    const updated = categoriesList.filter(c => c.value !== value);
    setCategoriesList(updated);
    saveCategories(updated);
  };

  const { data: metrics, isLoading } = useQuery<DashboardMetrics>({
    queryKey: ['dashboard', 'metrics'],
    queryFn: () => api.get('/dashboard/metrics').then(r => r.data),
    refetchInterval: 60000,
  });

  const { data: alerts } = useQuery({
    queryKey: ['dashboard', 'alerts'],
    queryFn: () => api.get('/dashboard/inactivity-alerts').then(r => r.data),
    refetchInterval: 300000,
  });

  const { data: teamPerf } = useQuery({
    queryKey: ['dashboard', 'team', teamRole, teamDateFrom, teamDateTo],
    queryFn: () => api.get('/dashboard/team-performance', {
      params: {
        role:      teamRole      || undefined,
        date_from: teamDateFrom  || undefined,
        date_to:   teamDateTo    || undefined,
      },
    }).then(r => r.data),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#FC2B5F', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const statusData = Object.entries(metrics?.merchantsByStatus || {}).map(([status, count]) => ({
    name: STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status,
    value: count as number,
  }));

  const riskData = Object.entries(metrics?.riskDistribution || {}).map(([risk, count]) => ({
    name: risk.charAt(0).toUpperCase() + risk.slice(1),
    value: count as number,
  }));

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Métricas en tiempo real del sistema</p>
        </div>
        <div className="text-xs text-gray-400 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm">
          Actualización automática cada 60s
        </div>
      </div>

      {/* ── Panel de Países Activos — solo admin/onboarding ── */}
      {!isCommercial && (
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4" style={{ color: '#FC2B5F' }} />
            <h3 className="font-semibold text-gray-900 text-sm">Países Operativos</h3>
            <span className="badge bg-gray-100 text-gray-500 text-xs">{activeCountries.length}</span>
          </div>
          <button
            onClick={() => setShowCountryPanel(!showCountryPanel)}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors"
            style={showCountryPanel
              ? { backgroundColor: '#FC2B5F', color: 'white', borderColor: '#FC2B5F' }
              : { backgroundColor: 'white', color: '#FC2B5F', borderColor: '#FC2B5F' }
            }
          >
            <Plus className="w-3.5 h-3.5" />
            Agregar país
          </button>
        </div>

        {/* Países activos */}
        <div className="flex flex-wrap gap-2">
          {activeCountries.map(c => (
            <div
              key={c.code}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-200 bg-white text-sm font-medium text-gray-700"
            >
              <span className="text-base leading-none">{c.flag}</span>
              <span>{c.name}</span>
              <span className="text-xs text-gray-400">{c.currencyCode}</span>
              {activeCountries.length > 1 && (
                <button
                  onClick={() => handleRemoveCountry(c.code)}
                  className="ml-1 p-0.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title={`Quitar ${c.name}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Panel para agregar países */}
        {showCountryPanel && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Agregar país al sistema
            </p>
            <input
              type="text"
              className="input mb-3 text-sm"
              placeholder="Buscar país..."
              value={countrySearch}
              onChange={e => setCountrySearch(e.target.value)}
            />
            {availableToAdd.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-3">
                {countrySearch ? 'No se encontraron países' : '✓ Todos los países disponibles ya están activos'}
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                {availableToAdd.map(c => (
                  <button
                    key={c.code}
                    onClick={() => handleAddCountry(c)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:border-rose-300 hover:bg-rose-50 transition-colors text-left group"
                  >
                    <span className="text-lg leading-none">{c.flag}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">{c.name}</p>
                      <p className="text-xs text-gray-400">{c.currencyCode}</p>
                    </div>
                    <Plus className="w-3.5 h-3.5 text-gray-300 group-hover:text-rose-500 ml-auto flex-shrink-0 transition-colors" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      )} {/* end !isCommercial countries panel */}

      {/* ── Panel de Configuración del Sistema — solo admin/onboarding ── */}
      {!isCommercial && (
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4" style={{ color: '#FC2B5F' }} />
            <h3 className="font-semibold text-gray-900 text-sm">Configuración del Sistema</h3>
          </div>
          <div className="flex gap-2 flex-wrap">
            {([
              { key: 'statuses',       icon: Shield,       label: 'Estados' },
              { key: 'risks',          icon: Shield,       label: 'Niveles de Riesgo' },
              { key: 'payments',       icon: CreditCard,   label: 'Métodos de Pago' },
              { key: 'mcc',            icon: Hash,         label: 'Códigos MCC' },
              { key: 'business_types', icon: Tag,          label: 'Tipos de Comercio' },
              { key: 'industries',     icon: Layers,       label: 'Rubros' },
              { key: 'categories',     icon: FolderTree,   label: 'Categorías' },
            ] as const).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setActiveConfigPanel(activeConfigPanel === key ? null : key)}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors"
                style={activeConfigPanel === key
                  ? { backgroundColor: '#FC2B5F', color: 'white', borderColor: '#FC2B5F' }
                  : { backgroundColor: 'white', color: '#FC2B5F', borderColor: '#FC2B5F' }
                }
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Estados ── */}
        {activeConfigPanel === 'statuses' && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Estados de Comercio</p>
              <span className="text-xs text-gray-400">{statuses.length} estados</span>
            </div>

            <div className="border border-gray-100 rounded-xl overflow-hidden">
              {statuses.map((s, i) => (
                <div
                  key={s.value}
                  className={`flex items-center justify-between px-4 py-2.5 ${i < statuses.length - 1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50 transition-colors`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.hex }} />
                    <span className="text-sm font-medium text-gray-800">{s.label}</span>
                    <span className="text-xs text-gray-400 font-mono">{s.value}</span>
                    {s.isDefault && (
                      <span className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">predeterminado</span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (statuses.length <= 1) { toast.error('Debe haber al menos 1 estado'); return; }
                      handleRemoveStatus(s.value);
                      toast.success(`Estado "${s.label}" eliminado`);
                    }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title={`Eliminar "${s.label}"`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add form */}
            <div className="flex gap-2 items-end pt-1">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Nombre del estado</label>
                <input
                  className="input text-sm"
                  value={newStatus.label}
                  onChange={e => setNewStatus(s => ({ ...s, label: e.target.value }))}
                  placeholder="Ej: En Negociación"
                  onKeyDown={e => e.key === 'Enter' && handleAddStatus()}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Color</label>
                <input
                  type="color"
                  className="input h-9 w-14 p-1 cursor-pointer"
                  value={newStatus.hex}
                  onChange={e => setNewStatus(s => ({ ...s, hex: e.target.value }))}
                />
              </div>
              <button onClick={handleAddStatus} disabled={!newStatus.label.trim()} className="btn-primary text-sm flex items-center gap-1 h-9 disabled:opacity-40">
                <Plus className="w-3.5 h-3.5" /> Agregar
              </button>
            </div>
          </div>
        )}

        {/* ── Niveles de Riesgo ── */}
        {activeConfigPanel === 'risks' && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Niveles de Riesgo</p>
              <span className="text-xs text-gray-400">{riskLevels.length} niveles</span>
            </div>

            <div className="border border-gray-100 rounded-xl overflow-hidden">
              {riskLevels.map((r, i) => (
                <div
                  key={r.value}
                  className={`flex items-center justify-between px-4 py-2.5 ${i < riskLevels.length - 1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50 transition-colors`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg leading-none">{r.icon}</span>
                    <span className="text-sm font-medium text-gray-800">{r.label}</span>
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: r.hex }} />
                    {r.isDefault && (
                      <span className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">predeterminado</span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (riskLevels.length <= 1) { toast.error('Debe haber al menos 1 nivel'); return; }
                      handleRemoveRisk(r.value);
                      toast.success(`Nivel "${r.label}" eliminado`);
                    }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title={`Eliminar "${r.label}"`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add form */}
            <div className="flex gap-2 items-end pt-1">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Nombre del nivel</label>
                <input
                  className="input text-sm"
                  value={newRisk.label}
                  onChange={e => setNewRisk(r => ({ ...r, label: e.target.value }))}
                  placeholder="Ej: Platino"
                  onKeyDown={e => e.key === 'Enter' && handleAddRisk()}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Emoji</label>
                <input
                  className="input w-16 text-center text-lg"
                  value={newRisk.icon}
                  onChange={e => setNewRisk(r => ({ ...r, icon: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Color</label>
                <input
                  type="color"
                  className="input h-9 w-14 p-1 cursor-pointer"
                  value={newRisk.hex}
                  onChange={e => setNewRisk(r => ({ ...r, hex: e.target.value }))}
                />
              </div>
              <button onClick={handleAddRisk} disabled={!newRisk.label.trim()} className="btn-primary text-sm flex items-center gap-1 h-9 disabled:opacity-40">
                <Plus className="w-3.5 h-3.5" /> Agregar
              </button>
            </div>
          </div>
        )}

        {/* ── Métodos de Pago ── */}
        {activeConfigPanel === 'payments' && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Métodos de Pago</p>
              <span className="text-xs text-gray-400">{paymentMethods.length} métodos</span>
            </div>

            <div className="border border-gray-100 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              {paymentMethods.map((m, i) => (
                <div
                  key={m.id}
                  className={`flex items-center justify-between px-4 py-2.5 ${i < paymentMethods.length - 1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50 transition-colors`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-medium text-gray-800 truncate">{m.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      m.type === 'pay_in'  ? 'bg-blue-50 text-blue-600' :
                      m.type === 'pay_out' ? 'bg-purple-50 text-purple-600' :
                                             'bg-gray-100 text-gray-500'
                    }`}>
                      {m.type === 'both' ? 'In / Out' : m.type === 'pay_in' ? 'Pay In' : 'Pay Out'}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      handleRemovePayment(m.id);
                      toast.success(`Método "${m.name}" eliminado`);
                    }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 ml-2"
                    title={`Eliminar "${m.name}"`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add form */}
            <div className="flex gap-2 items-end pt-1">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Nombre del método</label>
                <input
                  className="input text-sm"
                  value={newPayment.name}
                  onChange={e => setNewPayment(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ej: Nequi"
                  onKeyDown={e => e.key === 'Enter' && handleAddPayment()}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Tipo</label>
                <select
                  className="input text-sm w-28"
                  value={newPayment.type}
                  onChange={e => setNewPayment(p => ({ ...p, type: e.target.value as any }))}
                >
                  <option value="pay_in">Pay In</option>
                  <option value="pay_out">Pay Out</option>
                  <option value="both">Ambos</option>
                </select>
              </div>
              <button onClick={handleAddPayment} disabled={!newPayment.name.trim()} className="btn-primary text-sm flex items-center gap-1 h-9 disabled:opacity-40">
                <Plus className="w-3.5 h-3.5" /> Agregar
              </button>
            </div>
          </div>
        )}

        {/* ── Códigos MCC ── */}
        {activeConfigPanel === 'mcc' && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Códigos MCC</p>
              <span className="text-xs text-gray-400">{mccCodes.length} códigos</span>
            </div>

            <div className="border border-gray-100 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              {mccCodes.map((m, i) => (
                <div
                  key={m.code}
                  className={`flex items-center justify-between px-4 py-2.5 ${i < mccCodes.length - 1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50 transition-colors`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-mono font-medium text-gray-800">{m.code}</span>
                    <span className="text-sm text-gray-500 truncate">{m.description}</span>
                  </div>
                  <button
                    onClick={() => {
                      if (mccCodes.length <= 1) { toast.error('Debe haber al menos 1 código MCC'); return; }
                      handleRemoveMcc(m.code);
                      toast.success(`MCC "${m.code}" eliminado`);
                    }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 ml-2"
                    title={`Eliminar "${m.code}"`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add form */}
            <div className="flex gap-2 items-end pt-1">
              <div className="w-28">
                <label className="text-xs text-gray-500 mb-1 block">Código (4 dígitos)</label>
                <input
                  className="input text-sm"
                  value={newMcc.code}
                  onChange={e => setNewMcc(s => ({ ...s, code: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  placeholder="5411"
                  maxLength={4}
                  onKeyDown={e => e.key === 'Enter' && handleAddMcc()}
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Descripción</label>
                <input
                  className="input text-sm"
                  value={newMcc.description}
                  onChange={e => setNewMcc(s => ({ ...s, description: e.target.value }))}
                  placeholder="Ej: Grocery Stores"
                  onKeyDown={e => e.key === 'Enter' && handleAddMcc()}
                />
              </div>
              <button onClick={handleAddMcc} disabled={!newMcc.code.trim() || !newMcc.description.trim()} className="btn-primary text-sm flex items-center gap-1 h-9 disabled:opacity-40">
                <Plus className="w-3.5 h-3.5" /> Agregar
              </button>
            </div>
          </div>
        )}

        {/* ── Tipos de Comercio ── */}
        {activeConfigPanel === 'business_types' && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipos de Comercio</p>
              <span className="text-xs text-gray-400">{businessTypes.length} tipos</span>
            </div>

            <div className="border border-gray-100 rounded-xl overflow-hidden">
              {businessTypes.map((b, i) => (
                <div
                  key={b.value}
                  className={`flex items-center justify-between px-4 py-2.5 ${i < businessTypes.length - 1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50 transition-colors`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-800">{b.label}</span>
                    <span className="text-xs text-gray-400 font-mono">{b.value}</span>
                  </div>
                  <button
                    onClick={() => {
                      if (businessTypes.length <= 1) { toast.error('Debe haber al menos 1 tipo'); return; }
                      handleRemoveBusinessType(b.value);
                      toast.success(`Tipo "${b.label}" eliminado`);
                    }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title={`Eliminar "${b.label}"`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add form */}
            <div className="flex gap-2 items-end pt-1">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Nombre del tipo</label>
                <input
                  className="input text-sm"
                  value={newBusinessType}
                  onChange={e => setNewBusinessType(e.target.value)}
                  placeholder="Ej: Logística"
                  onKeyDown={e => e.key === 'Enter' && handleAddBusinessType()}
                />
              </div>
              <button onClick={handleAddBusinessType} disabled={!newBusinessType.trim()} className="btn-primary text-sm flex items-center gap-1 h-9 disabled:opacity-40">
                <Plus className="w-3.5 h-3.5" /> Agregar
              </button>
            </div>
          </div>
        )}

        {/* ── Rubros ── */}
        {activeConfigPanel === 'industries' && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Rubros</p>
              <span className="text-xs text-gray-400">{industriesList.length} rubros</span>
            </div>

            <div className="border border-gray-100 rounded-xl overflow-hidden">
              {industriesList.map((ind, i) => (
                <div
                  key={ind.value}
                  className={`flex items-center justify-between px-4 py-2.5 ${i < industriesList.length - 1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50 transition-colors`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-800">{ind.label}</span>
                    <span className="text-xs text-gray-400 font-mono">{ind.value}</span>
                  </div>
                  <button
                    onClick={() => {
                      if (industriesList.length <= 1) { toast.error('Debe haber al menos 1 rubro'); return; }
                      handleRemoveIndustry(ind.value);
                      toast.success(`Rubro "${ind.label}" eliminado`);
                    }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title={`Eliminar "${ind.label}"`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add form */}
            <div className="flex gap-2 items-end pt-1">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Nombre del rubro</label>
                <input
                  className="input text-sm"
                  value={newIndustry}
                  onChange={e => setNewIndustry(e.target.value)}
                  placeholder="Ej: Energía"
                  onKeyDown={e => e.key === 'Enter' && handleAddIndustry()}
                />
              </div>
              <button onClick={handleAddIndustry} disabled={!newIndustry.trim()} className="btn-primary text-sm flex items-center gap-1 h-9 disabled:opacity-40">
                <Plus className="w-3.5 h-3.5" /> Agregar
              </button>
            </div>
          </div>
        )}

        {/* ── Categorías ── */}
        {activeConfigPanel === 'categories' && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Categorías de Comercio</p>
              <span className="text-xs text-gray-400">{categoriesList.length} categorías</span>
            </div>

            <div className="border border-gray-100 rounded-xl overflow-hidden">
              {categoriesList.map((cat, i) => (
                <div
                  key={cat.value}
                  className={`flex items-center justify-between px-4 py-2.5 ${i < categoriesList.length - 1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50 transition-colors`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-800">{cat.label}</span>
                    <span className="text-xs text-gray-400 font-mono">{cat.value}</span>
                  </div>
                  <button
                    onClick={() => {
                      if (categoriesList.length <= 1) { toast.error('Debe haber al menos 1 categoría'); return; }
                      handleRemoveCategory(cat.value);
                      toast.success(`Categoría "${cat.label}" eliminada`);
                    }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title={`Eliminar "${cat.label}"`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add form */}
            <div className="flex gap-2 items-end pt-1">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Nombre de la categoría</label>
                <input
                  className="input text-sm"
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  placeholder="Ej: Microempresa"
                  onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                />
              </div>
              <button onClick={handleAddCategory} disabled={!newCategory.trim()} className="btn-primary text-sm flex items-center gap-1 h-9 disabled:opacity-40">
                <Plus className="w-3.5 h-3.5" /> Agregar
              </button>
            </div>
          </div>
        )}
      </div>
      )} {/* end !isCommercial config panel */}

      {/* ── Panel de Configuración SLA — solo admin ── */}
      {user?.role === 'admin' && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4" style={{ color: '#FC2B5F' }} />
            <h3 className="font-semibold text-gray-900 text-sm">Configuración de SLA</h3>
            <span className="badge bg-rose-50 text-rose-600 text-xs ml-1">Admin</span>
          </div>
          <SlaPanel />
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Building2}  label="Total Comercios"    value={metrics?.totalMerchants || 0}        sub={`${metrics?.activeThisWeek || 0} activos esta semana`} accent />        <StatCard icon={TrendingUp} label="Tasa de Conversión" value={`${metrics?.conversionRate || 0}%`}  sub="Comercios certificados" />
        <StatCard icon={Clock}      label="Tiempo Promedio"    value={`${metrics?.avgOnboardingDays || 0}d`} sub="Días de onboarding" />
        <StatCard icon={ListTodo}   label="Tareas Pendientes"  value={metrics?.pendingTasks || 0}           sub="En progreso o pendientes" />
      </div>

      {/* Inactivity Alerts */}
      {alerts && alerts.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            <h3 className="font-semibold text-orange-700 text-sm">
              Alertas de Inactividad ({alerts.length})
            </h3>
          </div>
          <div className="space-y-2">
            {alerts.slice(0, 5).map((alert: any) => (
              <Link
                key={alert.id}
                to={`/merchants/${alert.id}`}
                className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-orange-100 hover:border-orange-300 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{alert.legal_name}</p>
                  <p className="text-xs text-gray-500">{alert.assigned_to_name || 'Sin asignar'}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-orange-600">
                    {Math.round(alert.hours_inactive)}h sin actividad
                  </p>
                  <p className="text-xs text-gray-400">{alert.status}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Trend */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Tendencia Mensual</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={metrics?.monthlyTrend || []}>
              <defs>
                <linearGradient id="colorNew" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#FC2B5F" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#FC2B5F" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorCert" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="month" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Legend />
              <Area type="monotone" dataKey="new_merchants" name="Nuevos"      stroke="#FC2B5F" fill="url(#colorNew)"  strokeWidth={2} />
              <Area type="monotone" dataKey="certified"     name="Certificados" stroke="#10b981" fill="url(#colorCert)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Status Distribution */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Distribución por Estado</h3>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={200}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                  {statusData.map((_, index) => (
                    <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1.5">
              {statusData.map((item, i) => (
                <div key={item.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="text-gray-600">{item.name}</span>
                  </div>
                  <span className="text-gray-900 font-semibold">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Distribution */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Distribución de Riesgo</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={riskData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Bar dataKey="value" name="Comercios" radius={[6, 6, 0, 0]}>
                {riskData.map((_, index) => {
                  const colors = ['#10b981', '#f59e0b', '#f97316', '#FC2B5F'];
                  return <Cell key={index} fill={colors[index] || '#FC2B5F'} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top Scored Merchants */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Top Comercios por Score</h3>
            <Activity className="w-4 h-4 text-gray-400" />
          </div>
          <div className="space-y-3">
            {(metrics?.topScores || []).map((m: any) => (
              <Link key={m.id} to={`/merchants/${m.id}`} className="block hover:bg-gray-50 rounded-lg p-2 -mx-2 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900 truncate">{m.legal_name}</span>
                  <span className={`text-sm font-bold ${scoreColor(m.score)}`}>{m.score}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${scoreBarColor(m.score)}`}
                    style={{ width: `${m.score}%` }}
                  />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Team Performance — oculto para comercial */}
      {!isCommercial && teamPerf && (
        <div className="card">
          {/* Header + filtros */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Users className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <h3 className="font-semibold text-gray-900">Rendimiento del Equipo</h3>
              <span className="badge bg-gray-100 text-gray-500 text-xs">{(teamPerf as any[]).length} usuarios</span>
            </div>

            {/* Filtro por rol */}
            <select
              className="input w-auto text-sm"
              value={teamRole}
              onChange={e => setTeamRole(e.target.value)}
            >
              <option value="">Todos los roles</option>
              <option value="admin">Administrador</option>
              <option value="commercial">Comercial</option>
              <option value="onboarding">Onboarding</option>
            </select>

            {/* Filtro por fecha desde */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 whitespace-nowrap">Desde</label>
              <input
                type="date"
                className="input w-auto text-sm"
                value={teamDateFrom}
                onChange={e => setTeamDateFrom(e.target.value)}
              />
            </div>

            {/* Filtro por fecha hasta */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 whitespace-nowrap">Hasta</label>
              <input
                type="date"
                className="input w-auto text-sm"
                value={teamDateTo}
                onChange={e => setTeamDateTo(e.target.value)}
              />
            </div>

            {/* Limpiar filtros */}
            {(teamRole || teamDateFrom || teamDateTo) && (
              <button
                onClick={() => { setTeamRole(''); setTeamDateFrom(''); setTeamDateTo(''); }}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors whitespace-nowrap"
              >
                Limpiar
              </button>
            )}
          </div>

          {(teamPerf as any[]).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              No hay datos para los filtros seleccionados.
            </p>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="table-header">Nombre</th>
                  <th className="table-header">Rol</th>
                  <th className="table-header text-right">Asignados</th>
                  <th className="table-header text-right">Certificados</th>
                  <th className="table-header text-right">Tareas</th>
                  <th className="table-header text-right">Score Prom.</th>
                </tr>
              </thead>
              <tbody>
                {(teamPerf as any[]).map((member: any) => (
                  <tr key={member.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="table-cell font-medium text-gray-900">{member.name}</td>
                    <td className="table-cell">
                      <span className={`badge text-xs ${
                        member.role === 'admin'      ? 'bg-purple-50 text-purple-600' :
                        member.role === 'onboarding' ? 'bg-green-50 text-green-600' :
                                                       'bg-blue-50 text-blue-600'
                      }`}>
                        {member.role === 'admin' ? 'Admin' : member.role === 'onboarding' ? 'Onboarding' : 'Comercial'}
                      </span>
                    </td>
                    <td className="table-cell text-right text-gray-700">{member.assigned_merchants}</td>
                    <td className="table-cell text-right text-emerald-600 font-medium">{member.certified_merchants}</td>
                    <td className="table-cell text-right text-gray-700">
                      {member.completed_tasks}/{parseInt(member.completed_tasks) + parseInt(member.pending_tasks)}
                    </td>
                    <td className={`table-cell text-right font-semibold ${scoreColor(Math.round(member.avg_merchant_score || 0))}`}>
                      {Math.round(member.avg_merchant_score || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      {/* Recent Activity */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">Actividad Reciente</h3>
        <div className="space-y-3">
          {(metrics?.recentActivity || []).map((activity: any) => (
            <div key={activity.id} className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: '#FC2B5F' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700">
                  <span className="font-medium text-gray-900">{activity.user_name}</span>
                  {' '}{activity.action.toLowerCase().replace('_', ' ')}{' '}
                  {activity.merchant_name && (
                    <Link to={`/merchants/${activity.merchant_id}`} className="font-medium hover:underline" style={{ color: '#FC2B5F' }}>
                      {activity.merchant_name}
                    </Link>
                  )}
                </p>
                <p className="text-xs text-gray-400">{timeAgo(activity.created_at)}</p>
              </div>
            </div>
          ))}
          {(!metrics?.recentActivity || metrics.recentActivity.length === 0) && (
            <p className="text-sm text-gray-400 text-center py-4">Sin actividad reciente</p>
          )}
        </div>
      </div>
    </div>
  );
}
