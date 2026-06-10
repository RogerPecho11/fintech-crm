import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { Globe, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Zap, DollarSign, Activity, Calendar, Filter } from 'lucide-react';
import api from '../lib/api';
import toast from 'react-hot-toast';

const PIE_COLORS = ['#10B981', '#EF4444', '#F59E0B', '#F97316', '#6B7280'];

export default function WorldMonitoringPage() {
  const [dateFrom] = useState('2026-06-08');
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [commerceIds, setCommerceIds] = useState('');
  const [gatewayFilter, setGatewayFilter] = useState('');
  const [overview, setOverview] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [topCommerces, setTopCommerces] = useState<{ payin: any[]; payout: any[] }>({ payin: [], payout: [] });
  const [topGateways, setTopGateways] = useState<{ payin: any[]; payout: any[] }>({ payin: [], payout: [] });
  const [byCountry, setByCountry] = useState<any[]>([]);
  const [errors, setErrors] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(0);
  const [methods, setMethods] = useState<string[]>([]);
  const [commerceList, setCommerceList] = useState<any[]>([]);

  // Cargar pasarelas y comercios disponibles
  useEffect(() => {
    api.get('/transactions/gateways').then(r => {
      const gws = (r.data || []).map((g: any) => g.name).filter(Boolean) as string[];
      setMethods(gws.sort());
    }).catch(() => {});
    api.get('/transactions/commerces').then(r => {
      setCommerceList(r.data || []);
    }).catch(() => {});
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { period: '24h' };
      if (commerceIds) params.commerce_ids = commerceIds;
      if (gatewayFilter) params.gateway = gatewayFilter;

      const [ov, tl, cmPi, cmPo, gwPi, gwPo, ct, er] = await Promise.all([
        api.get('/world-monitoring/overview', { params }),
        api.get('/world-monitoring/timeline', { params: { ...params, type: 'payin' } }),
        api.get('/world-monitoring/by-commerce', { params: { ...params, type: 'payin' } }),
        api.get('/world-monitoring/by-commerce', { params: { ...params, type: 'payout' } }),
        api.get('/world-monitoring/by-gateway', { params: { ...params, type: 'payin' } }),
        api.get('/world-monitoring/by-gateway', { params: { ...params, type: 'payout' } }),
        api.get('/world-monitoring/by-country', { params }),
        api.get('/world-monitoring/errors', { params }),
      ]);
      setOverview(ov.data);
      setTimeline(tl.data);
      setTopCommerces({ payin: cmPi.data, payout: cmPo.data });
      setTopGateways({ payin: gwPi.data, payout: gwPo.data });
      setByCountry(ct.data);
      setErrors(er.data);
    } catch (err: any) {
      toast.error('Error al cargar datos');
    } finally { setLoading(false); }
  }, [commerceIds, gatewayFilter]);

  useEffect(() => {
    if (autoRefresh <= 0) return;
    const interval = setInterval(fetchAll, autoRefresh * 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchAll]);

  const fmt = (n: number) => n >= 1000000 ? (n/1000000).toFixed(1)+'M' : n >= 1000 ? (n/1000).toFixed(1)+'K' : String(n);
  const fmtMoney = (n: number) => '$' + fmt(n);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Globe className="w-6 h-6" style={{ color: '#FC2B5F' }} /> Monitoreo Mundial
          </h1>
          <p className="text-gray-500 text-sm">Monitoreo transaccional global</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input text-xs" value={autoRefresh} onChange={e => setAutoRefresh(Number(e.target.value))}>
            <option value={0}>Auto-refresh: Off</option>
            <option value={60}>Cada 1 min</option>
            <option value={300}>Cada 5 min</option>
          </select>
          <button onClick={fetchAll} disabled={loading} className="btn-primary flex items-center gap-2 text-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Desde</label>
            <input type="date" className="input text-sm" value={dateFrom} disabled />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Hasta</label>
            <input type="date" className="input text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-gray-500 block mb-1">Pasarela</label>
            <select className="input text-sm w-full" value={gatewayFilter} onChange={e => setGatewayFilter(e.target.value)}>
              <option value="">Todas las pasarelas</option>
              {methods.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-gray-500 block mb-1">Comercio</label>
            <select className="input text-sm w-full" value={commerceIds} onChange={e => setCommerceIds(e.target.value)}>
              <option value="">Todos los comercios</option>
              {commerceList.map((c: any) => <option key={c.id} value={String(c.id)}>{c.name} ({c.country})</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* KPIs - Pay In y Pay Out juntos */}
      {overview && (
        <div className="grid grid-cols-2 gap-4">
          {/* Pay In */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-xs font-semibold text-blue-600 uppercase mb-3">Pay In</h3>
            <div className="grid grid-cols-3 gap-3">
              <div><p className="text-[10px] text-gray-500">Total</p><p className="text-lg font-bold">{fmt(overview.payin.total)}</p></div>
              <div><p className="text-[10px] text-gray-500">Success Rate</p><p className={`text-lg font-bold ${Number(overview.payin.successRate) >= 80 ? 'text-green-600' : 'text-red-600'}`}>{overview.payin.successRate}%</p></div>
              <div><p className="text-[10px] text-gray-500">Fallidas</p><p className="text-lg font-bold text-red-600">{fmt(overview.payin.failed)}</p></div>
              <div><p className="text-[10px] text-gray-500">Pendientes</p><p className="text-lg font-bold text-yellow-600">{fmt(overview.payin.pending)}</p></div>
              <div><p className="text-[10px] text-gray-500">Volumen</p><p className="text-lg font-bold text-green-600">{fmtMoney(overview.payin.volume)}</p></div>
              <div><p className="text-[10px] text-gray-500">TPM</p><p className="text-lg font-bold">{overview.payin.tpm}</p></div>
            </div>
          </div>
          {/* Pay Out */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-xs font-semibold text-purple-600 uppercase mb-3">Pay Out</h3>
            <div className="grid grid-cols-3 gap-3">
              <div><p className="text-[10px] text-gray-500">Total</p><p className="text-lg font-bold">{fmt(overview.payout.total)}</p></div>
              <div><p className="text-[10px] text-gray-500">Success Rate</p><p className={`text-lg font-bold ${Number(overview.payout.successRate) >= 80 ? 'text-green-600' : 'text-red-600'}`}>{overview.payout.successRate}%</p></div>
              <div><p className="text-[10px] text-gray-500">Fallidas</p><p className="text-lg font-bold text-red-600">{fmt(overview.payout.failed)}</p></div>
              <div><p className="text-[10px] text-gray-500">Pendientes</p><p className="text-lg font-bold text-yellow-600">{fmt(overview.payout.pending)}</p></div>
              <div><p className="text-[10px] text-gray-500">Volumen</p><p className="text-lg font-bold text-green-600">{fmtMoney(overview.payout.volume)}</p></div>
              <div><p className="text-[10px] text-gray-500">Expiradas</p><p className="text-lg font-bold text-orange-500">{fmt(overview.payout.expired)}</p></div>
            </div>
          </div>
        </div>
      )}

      {/* Grafico temporal + Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Evolucion por Hora (Pay In)</h3>
          {timeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="time" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="success" name="Exitosas" stroke="#10B981" fill="#10B98130" />
                <Area type="monotone" dataKey="failed" name="Fallidas" stroke="#EF4444" fill="#EF444430" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <p className="text-center text-gray-400 py-10">Haz clic en Actualizar</p>}
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Por Pais</h3>
          {byCountry.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={byCountry.slice(0, 6)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 9 }} />
                <YAxis type="category" dataKey="country" width={30} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="success" name="OK" fill="#10B981" stackId="a" />
                <Bar dataKey="failed" name="Fail" fill="#EF4444" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          ) : null}
        </div>
      </div>

      {/* Top Errores */}
      {errors.length > 0 && (
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Top Errores</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {errors.slice(0, 8).map((e: any, i: number) => (
              <div key={i} className="p-2 bg-red-50 rounded-lg">
                <p className="text-xs font-medium text-gray-700 truncate">{e.method}</p>
                <p className="text-xs text-red-600">{e.status}</p>
                <p className="text-sm font-bold text-red-700">{Number(e.cantidad).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Comercios Pay In y Pay Out lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="text-sm font-semibold text-blue-600 mb-3">Top Comercios - Pay In</h3>
          <div className="overflow-y-auto max-h-[300px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white"><tr className="border-b">
                <th className="text-left p-1">Comercio</th><th className="text-right p-1">Total</th><th className="text-right p-1">Rate</th>
              </tr></thead>
              <tbody>
                {topCommerces.payin.map((c: any) => (
                  <tr key={c.commerce_id} className="border-b border-gray-50">
                    <td className="p-1 truncate max-w-[120px]">{c.name}</td>
                    <td className="p-1 text-right">{fmt(c.total)}</td>
                    <td className="p-1 text-right"><span className={`font-bold ${Number(c.successRate)>=80?'text-green-600':'text-red-600'}`}>{c.successRate}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="text-sm font-semibold text-purple-600 mb-3">Top Comercios - Pay Out</h3>
          <div className="overflow-y-auto max-h-[300px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white"><tr className="border-b">
                <th className="text-left p-1">Comercio</th><th className="text-right p-1">Total</th><th className="text-right p-1">Rate</th>
              </tr></thead>
              <tbody>
                {topCommerces.payout.map((c: any) => (
                  <tr key={c.commerce_id} className="border-b border-gray-50">
                    <td className="p-1 truncate max-w-[120px]">{c.name}</td>
                    <td className="p-1 text-right">{fmt(c.total)}</td>
                    <td className="p-1 text-right"><span className={`font-bold ${Number(c.successRate)>=80?'text-green-600':'text-red-600'}`}>{c.successRate}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pasarelas Pay In y Pay Out */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="text-sm font-semibold text-blue-600 mb-3">Pasarelas - Pay In</h3>
          <div className="overflow-y-auto max-h-[300px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white"><tr className="border-b">
                <th className="text-left p-1">Pasarela</th><th className="p-1">Pais</th><th className="text-right p-1">Total</th><th className="text-right p-1">Rate</th>
              </tr></thead>
              <tbody>
                {topGateways.payin.map((g: any, i: number) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="p-1 truncate max-w-[100px]">{g.gateway}</td>
                    <td className="p-1 text-center">{g.country}</td>
                    <td className="p-1 text-right">{fmt(g.total)}</td>
                    <td className="p-1 text-right"><span className={`font-bold ${Number(g.successRate)>=80?'text-green-600':'text-red-600'}`}>{g.successRate}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="text-sm font-semibold text-purple-600 mb-3">Pasarelas - Pay Out</h3>
          <div className="overflow-y-auto max-h-[300px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white"><tr className="border-b">
                <th className="text-left p-1">Pasarela</th><th className="p-1">Pais</th><th className="text-right p-1">Total</th><th className="text-right p-1">Rate</th>
              </tr></thead>
              <tbody>
                {topGateways.payout.map((g: any, i: number) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="p-1 truncate max-w-[100px]">{g.gateway}</td>
                    <td className="p-1 text-center">{g.country}</td>
                    <td className="p-1 text-right">{fmt(g.total)}</td>
                    <td className="p-1 text-right"><span className={`font-bold ${Number(g.successRate)>=80?'text-green-600':'text-red-600'}`}>{g.successRate}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
