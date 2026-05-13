import { useState, useEffect, useCallback, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Line, LineChart } from 'recharts';
import { Activity, RefreshCw, AlertTriangle, Clock, XCircle, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';

const METHOD_COLORS = ['#1E3A5F', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#84CC16', '#EC4899'];

export default function MonitoringPage() {
  const controllerRef = useRef<AbortController | null>(null);
  const [country, setCountry] = useState('');
  const [commerceId, setCommerceId] = useState('');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const [countries, setCountries] = useState<string[]>([]);
  const [commerces, setCommerces] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState('USD');
  const [chartData, setChartData] = useState<any[]>([]);
  const [payinMethods, setPayinMethods] = useState<any[]>([]);
  const [payoutMethods, setPayoutMethods] = useState<any[]>([]);
  const [approvalRate, setApprovalRate] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<{ inactivity: any[]; drops: any[] }>({ inactivity: [], drops: [] });

  useEffect(() => {
    api.get('/monitoring/countries').then(r => setCountries(r.data || [])).catch(() => {});
    return () => { controllerRef.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!country) { setCommerces([]); setCommerceId(''); return; }
    api.get('/monitoring/commerces', { params: { country } })
      .then(r => { setCommerces(r.data || []); setCommerceId(''); })
      .catch(() => setCommerces([]));
  }, [country]);

  const fetchData = useCallback(async () => {
    if (!commerceId) { toast.error('Selecciona un comercio'); return; }
    setLoading(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    const params = { commerce_id: commerceId, date_from: dateFrom, date_to: dateTo };
    const signal = controller.signal;

    try {
      // Volumen diario
      const volR = await api.get('/monitoring/daily-volume', { params, signal });
      const { payin, payout, currency: cur } = volR.data;
      setCurrency(cur || 'USD');

      const map = new Map<string, any>();
      (payin || []).forEach((d: any) => {
        const key = d.fecha?.slice(0, 10);
        map.set(key, { fecha: key, payin_monto: Number(d.monto), payin_cantidad: Number(d.cantidad), payout_monto: 0, payout_cantidad: 0 });
      });
      (payout || []).forEach((d: any) => {
        const key = d.fecha?.slice(0, 10);
        const ex = map.get(key) || { fecha: key, payin_monto: 0, payin_cantidad: 0, payout_monto: 0, payout_cantidad: 0 };
        ex.payout_monto = Number(d.monto); ex.payout_cantidad = Number(d.cantidad);
        map.set(key, ex);
      });
      setChartData(Array.from(map.values()).sort((a, b) => a.fecha.localeCompare(b.fecha)));

      // Por método
      const methR = await api.get('/monitoring/by-method', { params, signal });
      setPayinMethods(methR.data?.payin || []);
      setPayoutMethods(methR.data?.payout || []);

      // Tasa de aprobación
      const appR = await api.get('/monitoring/approval-rate', { params, signal });
      setApprovalRate(appR.data || []);

      // Alertas
      const alertR = await api.get('/monitoring/alerts', { params: { commerce_id: commerceId }, signal });
      setAlerts(alertR.data || { inactivity: [], drops: [] });

    } catch (err: any) {
      if (err.name !== 'CanceledError' && err.code !== 'ERR_CANCELED') {
        toast.error('Error al cargar datos');
      }
    } finally {
      setLoading(false);
    }
  }, [commerceId, dateFrom, dateTo]);

  const sym = currency === 'PEN' ? 'S/' : currency === 'CLP' ? '$' : currency === 'BRL' ? 'R$' : '$';
  const formatMoney = (v: number) => {
    if (v >= 1000000) return sym + (v / 1000000).toFixed(2) + 'M';
    if (v >= 1000) return sym + (v / 1000).toFixed(1) + 'K';
    return sym + v.toFixed(0);
  };
  const formatCant = (v: number) => { if (v >= 1000) return (v / 1000).toFixed(1) + 'K'; return v.toString(); };
  const fmtDate = (v: string) => { const d = new Date(v + 'T00:00:00'); return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' }); };

  // Agrupar datos por método para gráficos de evolución
  const buildMethodChart = (raw: any[]) => {
    const methods = [...new Set(raw.map((r: any) => r.method))];
    const dateMap = new Map<string, any>();
    raw.forEach((r: any) => {
      const key = r.fecha?.slice(0, 10);
      if (!dateMap.has(key)) dateMap.set(key, { fecha: key });
      dateMap.get(key)![r.method] = Number(r.cantidad);
    });
    return { methods, data: Array.from(dateMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha)) };
  };

  const payinChart = buildMethodChart(payinMethods);
  const payoutChart = buildMethodChart(payoutMethods);

  // Resumen por método (totales)
  const buildMethodSummary = (raw: any[]) => {
    const map = new Map<string, { method: string; cantidad: number; monto: number; aprobadas: number; rechazadas: number }>();
    raw.forEach((r: any) => {
      const ex = map.get(r.method) || { method: r.method, cantidad: 0, monto: 0, aprobadas: 0, rechazadas: 0 };
      ex.cantidad += Number(r.cantidad); ex.monto += Number(r.monto);
      ex.aprobadas += Number(r.aprobadas); ex.rechazadas += Number(r.rechazadas);
      map.set(r.method, ex);
    });
    return Array.from(map.values()).sort((a, b) => b.monto - a.monto);
  };

  const payinSummary = buildMethodSummary(payinMethods);
  const payoutSummary = buildMethodSummary(payoutMethods);
  const totalAlerts = alerts.inactivity.length + alerts.drops.length;

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
          <label className="block text-xs font-medium text-gray-600 mb-1">País</label>
          <select value={country} onChange={e => setCountry(e.target.value)} className="input-field text-sm">
            <option value="">Seleccionar país</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Comercio</label>
          <select value={commerceId} onChange={e => setCommerceId(e.target.value)} className="input-field text-sm" disabled={!country}>
            <option value="">Seleccionar comercio</option>
            {commerces.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input-field text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input-field text-sm" />
        </div>
      </div>

      {/* Alertas */}
      {totalAlerts > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-semibold flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5" /> {totalAlerts} Alerta{totalAlerts > 1 ? 's' : ''}
          </h3>
          <div className="space-y-2">
            {alerts.inactivity.map((a: any, i: number) => (
              <div key={`i-${i}`} className="flex items-center gap-2 text-sm text-red-700">
                <Clock className="w-4 h-4 flex-shrink-0" />
                <span><strong>{a.method}</strong> — Sin transacciones hace {a.horas_inactivo}h</span>
              </div>
            ))}
            {alerts.drops.map((a: any, i: number) => (
              <div key={`d-${i}`} className="flex items-center gap-2 text-sm text-red-700">
                <XCircle className="w-4 h-4 flex-shrink-0" />
                <span><strong>{a.method}</strong> — Tasa de error {a.tasa_error}% ({a.errores}/{a.total} en última hora)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gráfico Evolutivo TPV */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-600" /> Evolutivo TPV y # Trx por Día ({currency})
          </h3>
          <ResponsiveContainer width="100%" height={380}>
            <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="fecha" tick={{ fontSize: 10, angle: -45, textAnchor: 'end' }} height={60} tickFormatter={fmtDate} />
              <YAxis yAxisId="left" tickFormatter={formatMoney} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={formatCant} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any, name: string) => name.includes('Monto') ? [formatMoney(Number(v)), name] : [Number(v).toLocaleString(), name]} labelFormatter={fmtDate} />
              <Legend />
              <Bar yAxisId="left" dataKey="payin_monto" name="Monto Payin" fill="#1E3A5F" radius={[2, 2, 0, 0]} />
              <Bar yAxisId="left" dataKey="payout_monto" name="Monto Payout" fill="#93C5FD" radius={[2, 2, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="payin_cantidad" name="Cant. Payin" stroke="#F59E0B" strokeWidth={2} dot={{ r: 2 }} />
              <Line yAxisId="right" type="monotone" dataKey="payout_cantidad" name="Cant. Payout" stroke="#10B981" strokeWidth={2} dot={{ r: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Evolución Payin por Pasarela */}
      {payinChart.data.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Evolución Payin por Pasarela (# Trx/día)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={payinChart.data} margin={{ top: 10, right: 30, left: 10, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="fecha" tick={{ fontSize: 10, angle: -45, textAnchor: 'end' }} height={60} tickFormatter={fmtDate} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip labelFormatter={fmtDate} />
              <Legend />
              {payinChart.methods.map((m, i) => (
                <Line key={m} type="monotone" dataKey={m} name={m} stroke={METHOD_COLORS[i % METHOD_COLORS.length]} strokeWidth={2} dot={{ r: 2 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
          {/* Tabla detalle diario */}
          <div className="mt-4 overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white"><tr className="bg-gray-50">
                <th className="text-left p-2">Fecha</th>
                <th className="text-left p-2">Pasarela</th>
                <th className="text-right p-2">Trx</th>
                <th className="text-right p-2">Monto</th>
                <th className="text-right p-2">Aprobadas</th>
                <th className="text-right p-2">Rechazadas</th>
                <th className="text-right p-2">Tasa</th>
              </tr></thead>
              <tbody>
                {payinMethods.map((m: any, i: number) => {
                  const total = Number(m.aprobadas) + Number(m.rechazadas);
                  const rate = total > 0 ? (Number(m.aprobadas) / total * 100).toFixed(1) : 'N/A';
                  return (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="p-2 text-gray-500">{fmtDate(m.fecha?.slice(0, 10))}</td>
                      <td className="p-2 font-medium">{m.method}</td>
                      <td className="p-2 text-right">{Number(m.cantidad).toLocaleString()}</td>
                      <td className="p-2 text-right">{formatMoney(Number(m.monto))}</td>
                      <td className="p-2 text-right text-green-600">{Number(m.aprobadas).toLocaleString()}</td>
                      <td className="p-2 text-right text-red-600">{Number(m.rechazadas).toLocaleString()}</td>
                      <td className="p-2 text-right">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${Number(rate) >= 80 ? 'bg-green-100 text-green-800' : Number(rate) >= 50 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>{rate}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Evolución Payout por Pasarela */}
      {payoutChart.data.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Evolución Payout por Pasarela (# Trx/día)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={payoutChart.data} margin={{ top: 10, right: 30, left: 10, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="fecha" tick={{ fontSize: 10, angle: -45, textAnchor: 'end' }} height={60} tickFormatter={fmtDate} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip labelFormatter={fmtDate} />
              <Legend />
              {payoutChart.methods.map((m, i) => (
                <Line key={m} type="monotone" dataKey={m} name={m} stroke={METHOD_COLORS[i % METHOD_COLORS.length]} strokeWidth={2} dot={{ r: 2 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-4 overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white"><tr className="bg-gray-50">
                <th className="text-left p-2">Fecha</th>
                <th className="text-left p-2">Pasarela</th>
                <th className="text-right p-2">Trx</th>
                <th className="text-right p-2">Monto</th>
                <th className="text-right p-2">Aprobadas</th>
                <th className="text-right p-2">Rechazadas</th>
                <th className="text-right p-2">Tasa</th>
              </tr></thead>
              <tbody>
                {payoutMethods.map((m: any, i: number) => {
                  const total = Number(m.aprobadas) + Number(m.rechazadas);
                  const rate = total > 0 ? (Number(m.aprobadas) / total * 100).toFixed(1) : 'N/A';
                  return (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="p-2 text-gray-500">{fmtDate(m.fecha?.slice(0, 10))}</td>
                      <td className="p-2 font-medium">{m.method}</td>
                      <td className="p-2 text-right">{Number(m.cantidad).toLocaleString()}</td>
                      <td className="p-2 text-right">{formatMoney(Number(m.monto))}</td>
                      <td className="p-2 text-right text-green-600">{Number(m.aprobadas).toLocaleString()}</td>
                      <td className="p-2 text-right text-red-600">{Number(m.rechazadas).toLocaleString()}</td>
                      <td className="p-2 text-right">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${Number(rate) >= 80 ? 'bg-green-100 text-green-800' : Number(rate) >= 50 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>{rate}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tasa de Aprobación por Método */}
      {approvalRate.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" /> Tasa de Aprobación por Método de Pago
          </h3>
          <ResponsiveContainer width="100%" height={Math.max(200, approvalRate.length * 45)}>
            <BarChart data={approvalRate} layout="vertical" margin={{ left: 10, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} tickFormatter={v => v + '%'} />
              <YAxis type="category" dataKey="method" width={140} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => [Number(v).toFixed(1) + '%', 'Aprobación']} />
              <Bar dataKey="tasa_aprobacion" fill="#10B981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
