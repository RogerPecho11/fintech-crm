import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Line } from 'recharts';
import { AlertTriangle, Activity, TrendingUp, Clock, CheckCircle, XCircle, RefreshCw, CreditCard, ArrowDownCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';

interface CommerceInfo {
  id: number;
  name: string;
  country: string;
  currency: string;
  payin_methods: string[];
  payout_methods: string[];
}

interface Alert {
  method: string;
  ultima_transaccion: string;
  horas_inactivo: number;
}

interface Drop {
  method: string;
  total: number;
  errores: number;
  tasa_error: number;
}

interface PayoutTimeAlert {
  method: string;
  total: number;
  tiempo_promedio_min: number;
}

export default function MonitoringPage() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [commerceId, setCommerceId] = useState('');
  const [country, setCountry] = useState('');
  const [commerces, setCommerces] = useState<any[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Data states
  const [commerceInfo, setCommerceInfo] = useState<CommerceInfo | null>(null);
  const [dailyVolume, setDailyVolume] = useState<{ payin: any[]; payout: any[] }>({ payin: [], payout: [] });
  const [byMethod, setByMethod] = useState<{ payin: any[]; payout: any[] }>({ payin: [], payout: [] });
  const [approvalRate, setApprovalRate] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<{ inactivity: Alert[]; drops: Drop[]; payoutTime: PayoutTimeAlert[] }>({ inactivity: [], drops: [], payoutTime: [] });
  const [payoutTime, setPayoutTime] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    if (!commerceId) {
      toast.error('Selecciona un comercio para consultar');
      return;
    }
    setLoading(true);
    try {
      const params: any = { commerce_id: commerceId };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (country) params.country = country;

      // Info del comercio (métodos activos, moneda)
      try { const r = await api.get(`/monitoring/commerce-info/${commerceId}`); setCommerceInfo(r.data); } catch {}
      // Volumen diario
      try { const r = await api.get('/monitoring/daily-volume', { params }); setDailyVolume(r.data); } catch {}
      // Volumen por método (payin + payout)
      try { const r = await api.get('/monitoring/by-method', { params }); setByMethod(r.data); } catch {}
      // Tasa de aprobación
      try { const r = await api.get('/monitoring/approval-rate', { params }); setApprovalRate(r.data); } catch {}
      // Alertas del comercio
      try { const r = await api.get('/monitoring/alerts', { params: { commerce_id: commerceId } }); setAlerts(r.data); } catch {}
      // Tiempo de payouts
      try { const r = await api.get('/monitoring/payout-time', { params }); setPayoutTime(r.data); } catch {}
    } catch (err) {
      toast.error('Error al cargar datos de monitoreo');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, commerceId, country]);

  useEffect(() => {
    api.get('/monitoring/commerces').then(r => setCommerces(r.data)).catch(() => {});
    api.get('/monitoring/countries').then(r => setCountries(r.data)).catch(() => {});
  }, []);

  // Combinar payin/payout para gráfico diario
  const dailyChartData = (() => {
    const map = new Map<string, any>();
    dailyVolume.payin.forEach((d: any) => {
      const key = d.fecha?.slice(0, 10);
      map.set(key, { fecha: key, payin_cantidad: Number(d.cantidad), payin_monto: Number(d.monto), payout_cantidad: 0, payout_monto: 0 });
    });
    dailyVolume.payout.forEach((d: any) => {
      const key = d.fecha?.slice(0, 10);
      const existing = map.get(key) || { fecha: key, payin_cantidad: 0, payin_monto: 0, payout_cantidad: 0, payout_monto: 0 };
      existing.payout_cantidad = Number(d.cantidad);
      existing.payout_monto = Number(d.monto);
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
  })();

  const totalAlerts = alerts.inactivity.length + alerts.drops.length + alerts.payoutTime.length;
  const currency = commerceInfo?.currency || 'USD';

  const formatMoney = (v: number) => {
    if (v >= 1000000) return currency + ' ' + (v / 1000000).toFixed(2) + 'M';
    if (v >= 1000) return currency + ' ' + (v / 1000).toFixed(1) + 'K';
    return currency + ' ' + v.toFixed(0);
  };

  const formatMoneyShort = (v: number) => {
    if (v >= 1000000) return (v / 1000000).toFixed(2) + 'M';
    if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
    return v.toFixed(0);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monitoreo de Transacciones</h1>
          <p className="text-gray-500 text-sm">Datos en tiempo real desde producción</p>
        </div>
        <button onClick={fetchData} disabled={loading} className="btn-primary flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Cargando...' : 'Consultar'}
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input-field text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input-field text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Comercio *</label>
          <select value={commerceId} onChange={e => setCommerceId(e.target.value)} className="input-field text-sm">
            <option value="">Seleccionar comercio</option>
            {commerces.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">País</label>
          <select value={country} onChange={e => setCountry(e.target.value)} className="input-field text-sm">
            <option value="">Todos</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Info del comercio + Métodos activos */}
      {commerceInfo && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {commerceInfo.name}
              <span className="ml-2 text-sm font-normal text-gray-500">({commerceInfo.country} — {currency})</span>
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Payin Methods */}
            <div className="border border-blue-100 rounded-lg p-4 bg-blue-50/30">
              <h4 className="text-sm font-semibold text-blue-800 flex items-center gap-2 mb-2">
                <CreditCard className="w-4 h-4" /> Métodos Payin Activos ({commerceInfo.payin_methods.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {commerceInfo.payin_methods.length > 0 ? commerceInfo.payin_methods.map(m => (
                  <span key={m} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">{m}</span>
                )) : <span className="text-xs text-gray-400">Sin métodos activos</span>}
              </div>
            </div>
            {/* Payout Methods */}
            <div className="border border-green-100 rounded-lg p-4 bg-green-50/30">
              <h4 className="text-sm font-semibold text-green-800 flex items-center gap-2 mb-2">
                <ArrowDownCircle className="w-4 h-4" /> Métodos Payout Activos ({commerceInfo.payout_methods.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {commerceInfo.payout_methods.length > 0 ? commerceInfo.payout_methods.map(m => (
                  <span key={m} className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">{m}</span>
                )) : <span className="text-xs text-gray-400">Sin métodos activos</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alertas */}
      {totalAlerts > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-semibold flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5" /> {totalAlerts} Alerta{totalAlerts > 1 ? 's' : ''} Activa{totalAlerts > 1 ? 's' : ''}
          </h3>
          <div className="space-y-2">
            {alerts.inactivity.map((a, i) => (
              <div key={`inact-${i}`} className="flex items-center gap-2 text-sm text-red-700">
                <Clock className="w-4 h-4" />
                <span><strong>{a.method}</strong> — Sin transacciones hace {a.horas_inactivo}h</span>
              </div>
            ))}
            {alerts.drops.map((a, i) => (
              <div key={`drop-${i}`} className="flex items-center gap-2 text-sm text-red-700">
                <XCircle className="w-4 h-4" />
                <span><strong>{a.method}</strong> — Tasa de error {a.tasa_error}% ({a.errores}/{a.total} en última hora)</span>
              </div>
            ))}
            {alerts.payoutTime.map((a, i) => (
              <div key={`ptime-${i}`} className="flex items-center gap-2 text-sm text-orange-700">
                <Clock className="w-4 h-4" />
                <span><strong>{a.method || 'Payout'}</strong> — Tiempo promedio {a.tiempo_promedio_min} min (alerta &gt;30 min)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gráfico principal: Volumen diario */}
      {dailyChartData.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-600" /> Evolutivo TPV y # Trx por Día
            <span className="text-sm font-normal text-gray-400 ml-2">({currency})</span>
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={dailyChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tickFormatter={formatMoneyShort} />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip formatter={(value: any, name: string) => {
                if (name.includes('Monto')) return [formatMoney(Number(value)), name];
                return [Number(value).toLocaleString(), name];
              }} />
              <Legend />
              <Bar yAxisId="left" dataKey="payin_monto" name="Monto Payin" fill="#1E3A5F" />
              <Bar yAxisId="left" dataKey="payout_monto" name="Monto Payout" fill="#60A5FA" />
              <Line yAxisId="right" type="monotone" dataKey="payin_cantidad" name="Cant. Payin" stroke="#F59E0B" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="payout_cantidad" name="Cant. Payout" stroke="#10B981" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Detalle por Método — Payin */}
      {byMethod.payin?.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-blue-600" /> Volumen por Método — Payin
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left p-2">Método</th>
                  <th className="text-right p-2">Transacciones</th>
                  <th className="text-right p-2">Monto ({currency})</th>
                  <th className="text-right p-2">Aprobadas</th>
                  <th className="text-right p-2">Rechazadas</th>
                  <th className="text-right p-2">Tasa Aprob.</th>
                </tr>
              </thead>
              <tbody>
                {byMethod.payin.map((m: any, i: number) => {
                  const total = Number(m.aprobadas) + Number(m.rechazadas);
                  const rate = total > 0 ? (Number(m.aprobadas) / total * 100).toFixed(1) : 'N/A';
                  return (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-2 font-medium">{m.method}</td>
                      <td className="p-2 text-right">{Number(m.cantidad).toLocaleString()}</td>
                      <td className="p-2 text-right font-semibold">{formatMoney(Number(m.monto))}</td>
                      <td className="p-2 text-right text-green-600">{Number(m.aprobadas).toLocaleString()}</td>
                      <td className="p-2 text-right text-red-600">{Number(m.rechazadas).toLocaleString()}</td>
                      <td className="p-2 text-right">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${Number(rate) >= 80 ? 'bg-green-100 text-green-800' : Number(rate) >= 50 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                          {rate}{rate !== 'N/A' ? '%' : ''}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detalle por Método — Payout */}
      {byMethod.payout?.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <ArrowDownCircle className="w-5 h-5 text-green-600" /> Volumen por Método — Payout
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left p-2">Método</th>
                  <th className="text-right p-2">Transacciones</th>
                  <th className="text-right p-2">Monto ({currency})</th>
                  <th className="text-right p-2">Aprobadas</th>
                  <th className="text-right p-2">Rechazadas</th>
                  <th className="text-right p-2">Tasa Aprob.</th>
                </tr>
              </thead>
              <tbody>
                {byMethod.payout.map((m: any, i: number) => {
                  const total = Number(m.aprobadas) + Number(m.rechazadas);
                  const rate = total > 0 ? (Number(m.aprobadas) / total * 100).toFixed(1) : 'N/A';
                  return (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-2 font-medium">{m.method}</td>
                      <td className="p-2 text-right">{Number(m.cantidad).toLocaleString()}</td>
                      <td className="p-2 text-right font-semibold">{formatMoney(Number(m.monto))}</td>
                      <td className="p-2 text-right text-green-600">{Number(m.aprobadas).toLocaleString()}</td>
                      <td className="p-2 text-right text-red-600">{Number(m.rechazadas).toLocaleString()}</td>
                      <td className="p-2 text-right">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${Number(rate) >= 80 ? 'bg-green-100 text-green-800' : Number(rate) >= 50 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                          {rate}{rate !== 'N/A' ? '%' : ''}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tasa de Aprobación por Método (gráfico) */}
      {approvalRate.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" /> Tasa de Aprobación por Método de Pago
          </h3>
          <ResponsiveContainer width="100%" height={Math.max(200, approvalRate.length * 40)}>
            <BarChart data={approvalRate} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} tickFormatter={v => v + '%'} />
              <YAxis type="category" dataKey="method" width={150} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => [Number(v).toFixed(1) + '%', 'Tasa Aprobación']} />
              <Bar dataKey="tasa_aprobacion" fill="#10B981" radius={[0, 4, 4, 0]}>
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tiempo de Payouts por Método */}
      {payoutTime.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-600" /> Tiempo de Payouts por Método
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left p-2">Método</th>
                  <th className="text-right p-2">Total Payouts</th>
                  <th className="text-right p-2">Tiempo Promedio</th>
                  <th className="text-right p-2">Mínimo</th>
                  <th className="text-right p-2">Máximo</th>
                  <th className="text-center p-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {payoutTime.map((p: any, i: number) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-2 font-medium">{p.method || 'N/A'}</td>
                    <td className="p-2 text-right">{Number(p.total).toLocaleString()}</td>
                    <td className="p-2 text-right font-semibold">{p.tiempo_promedio_min} min</td>
                    <td className="p-2 text-right">{p.tiempo_min} min</td>
                    <td className="p-2 text-right">{p.tiempo_max} min</td>
                    <td className="p-2 text-center">
                      {Number(p.tiempo_promedio_min) <= 15 ? (
                        <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium"><CheckCircle className="w-4 h-4" /> OK</span>
                      ) : Number(p.tiempo_promedio_min) <= 30 ? (
                        <span className="inline-flex items-center gap-1 text-yellow-600 text-xs font-medium"><Clock className="w-4 h-4" /> Normal</span>
                      ) : Number(p.tiempo_promedio_min) <= 60 ? (
                        <span className="inline-flex items-center gap-1 text-orange-600 text-xs font-medium"><AlertTriangle className="w-4 h-4" /> Lento</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600 text-xs font-medium"><AlertTriangle className="w-4 h-4" /> Crítico</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
