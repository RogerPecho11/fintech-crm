import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, PieChart, Pie, Cell } from 'recharts';
import { Globe, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Zap, DollarSign, Activity } from 'lucide-react';
import api from '../lib/api';

const PERIODS = [
  { value: '1h', label: '1 Hora' },
  { value: '6h', label: '6 Horas' },
  { value: '24h', label: '24 Horas' },
  { value: '7d', label: '7 Dias' },
  { value: '30d', label: '30 Dias' },
];

const PIE_COLORS = ['#10B981', '#EF4444', '#F59E0B', '#F97316', '#6B7280'];

export default function WorldMonitoringPage() {
  const [period, setPeriod] = useState('24h');
  const [overview, setOverview] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [byGateway, setByGateway] = useState<any[]>([]);
  const [byCommerce, setByCommerce] = useState<any[]>([]);
  const [byCountry, setByCountry] = useState<any[]>([]);
  const [errors, setErrors] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<'payin' | 'payout'>('payin');
  const [autoRefresh, setAutoRefresh] = useState(0); // 0 = off, seconds

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, tl, gw, cm, ct, er] = await Promise.all([
        api.get('/world-monitoring/overview', { params: { period } }),
        api.get('/world-monitoring/timeline', { params: { period, type } }),
        api.get('/world-monitoring/by-gateway', { params: { period, type } }),
        api.get('/world-monitoring/by-commerce', { params: { period, type } }),
        api.get('/world-monitoring/by-country', { params: { period } }),
        api.get('/world-monitoring/errors', { params: { period } }),
      ]);
      setOverview(ov.data);
      setTimeline(tl.data);
      setByGateway(gw.data);
      setByCommerce(cm.data);
      setByCountry(ct.data);
      setErrors(er.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [period, type]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (autoRefresh <= 0) return;
    const interval = setInterval(fetchAll, autoRefresh * 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchAll]);

  const formatNum = (n: number) => n >= 1000000 ? (n/1000000).toFixed(1) + 'M' : n >= 1000 ? (n/1000).toFixed(1) + 'K' : String(n);
  const formatMoney = (n: number) => '$' + formatNum(n);

  const piData = overview ? [
    { name: 'Success', value: overview[type].success },
    { name: 'Failed', value: overview[type].failed },
    { name: 'Pending', value: overview[type].pending },
    { name: 'Expired', value: overview[type].expired },
    { name: 'Cancelled', value: overview[type].cancelled },
  ].filter(d => d.value > 0) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Globe className="w-6 h-6" style={{ color: '#FC2B5F' }} /> Monitoreo Mundial
          </h1>
          <p className="text-gray-500 text-sm">Monitoreo transaccional global desde la replica de produccion</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input text-sm" value={autoRefresh} onChange={e => setAutoRefresh(Number(e.target.value))}>
            <option value={0}>Auto-refresh: Off</option>
            <option value={30}>Cada 30s</option>
            <option value={60}>Cada 1 min</option>
            <option value={300}>Cada 5 min</option>
          </select>
          <button onClick={fetchAll} disabled={loading} className="btn-primary flex items-center gap-2 text-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 bg-white rounded-lg shadow p-4 items-center">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {PERIODS.map(p => (
            <button key={p.value} onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${period === p.value ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button onClick={() => setType('payin')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md ${type === 'payin' ? 'bg-blue-500 text-white' : 'text-gray-500'}`}>
            Pay In
          </button>
          <button onClick={() => setType('payout')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md ${type === 'payout' ? 'bg-purple-500 text-white' : 'text-gray-500'}`}>
            Pay Out
          </button>
        </div>
        {autoRefresh > 0 && <span className="text-xs text-green-600 flex items-center gap-1"><Zap className="w-3 h-3" /> Auto-refresh activo</span>}
      </div>

      {/* KPIs */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <KpiCard title="Total Trx" value={formatNum(overview[type].total)} icon={Activity} color="blue" />
          <KpiCard title="Success Rate" value={`${overview[type].successRate}%`} icon={TrendingUp}
            color={Number(overview[type].successRate) >= 80 ? 'green' : Number(overview[type].successRate) >= 50 ? 'yellow' : 'red'} />
          <KpiCard title="Fallidas" value={formatNum(overview[type].failed)} icon={TrendingDown} color="red" />
          <KpiCard title="Pendientes" value={formatNum(overview[type].pending)} icon={AlertTriangle} color="yellow" />
          <KpiCard title="Volumen" value={formatMoney(overview[type].volume)} icon={DollarSign} color="green" />
          <KpiCard title="TPM" value={String(Math.round(overview.payin.tpm || 0))} icon={Zap} color="purple" />
        </div>
      )}

      {/* Gráficos principales */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Evolucion Temporal ({type === 'payin' ? 'Pay In' : 'Pay Out'})</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="success" name="Exitosas" stroke="#10B981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="failed" name="Fallidas" stroke="#EF4444" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="total" name="Total" stroke="#3B82F6" strokeWidth={1} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Distribucion por Estado</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={piData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={2}>
                {piData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-2">
            {piData.map((d, i) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i] }} />
                  <span className="text-gray-600">{d.name}</span>
                </div>
                <span className="font-medium">{formatNum(d.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Por País */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Pay In por Pais</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={byCountry.slice(0, 8)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="country" width={40} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="success" name="Exitosas" fill="#10B981" stackId="a" />
              <Bar dataKey="failed" name="Fallidas" fill="#EF4444" stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top Errores */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Top Errores</h3>
          <div className="overflow-y-auto max-h-[250px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b"><th className="text-left p-1">Metodo</th><th className="text-left p-1">Estado</th><th className="text-right p-1">Cant</th></tr>
              </thead>
              <tbody>
                {errors.slice(0, 15).map((e: any, i: number) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="p-1 truncate max-w-[120px]">{e.method}</td>
                    <td className="p-1 text-red-600">{e.status}</td>
                    <td className="p-1 text-right font-medium">{Number(e.cantidad).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Top Comercios */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Top Comercios ({type === 'payin' ? 'Pay In' : 'Pay Out'})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-2">Comercio</th>
                <th className="text-left p-2">Pais</th>
                <th className="text-right p-2">Total</th>
                <th className="text-right p-2">Exitosas</th>
                <th className="text-right p-2">Fallidas</th>
                <th className="text-right p-2">Success Rate</th>
                <th className="text-right p-2">Volumen</th>
              </tr>
            </thead>
            <tbody>
              {byCommerce.map((c: any) => (
                <tr key={c.commerce_id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="p-2 font-medium">{c.name}</td>
                  <td className="p-2 text-gray-500">{c.country}</td>
                  <td className="p-2 text-right">{Number(c.total).toLocaleString()}</td>
                  <td className="p-2 text-right text-green-600">{Number(c.success).toLocaleString()}</td>
                  <td className="p-2 text-right text-red-600">{Number(c.failed).toLocaleString()}</td>
                  <td className="p-2 text-right">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      Number(c.successRate) >= 80 ? 'bg-green-100 text-green-800' :
                      Number(c.successRate) >= 50 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>{c.successRate}%</span>
                  </td>
                  <td className="p-2 text-right">{formatMoney(Number(c.volume))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Por Pasarela */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Por Pasarela ({type === 'payin' ? 'Pay In' : 'Pay Out'})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-2">Pasarela</th>
                <th className="text-left p-2">Pais</th>
                <th className="text-right p-2">Total</th>
                <th className="text-right p-2">Success Rate</th>
                <th className="text-right p-2">Volumen</th>
              </tr>
            </thead>
            <tbody>
              {byGateway.map((g: any, i: number) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="p-2 font-medium">{g.gateway}</td>
                  <td className="p-2 text-gray-500">{g.country}</td>
                  <td className="p-2 text-right">{Number(g.total).toLocaleString()}</td>
                  <td className="p-2 text-right">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      Number(g.successRate) >= 80 ? 'bg-green-100 text-green-800' :
                      Number(g.successRate) >= 50 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>{g.successRate}%</span>
                  </td>
                  <td className="p-2 text-right">{formatMoney(Number(g.volume))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, value, icon: Icon, color }: { title: string; value: string; icon: any; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600', green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600', yellow: 'bg-yellow-50 text-yellow-600',
    purple: 'bg-purple-50 text-purple-600',
  };
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${colors[color] || colors.blue}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-xs text-gray-500">{title}</span>
      </div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
