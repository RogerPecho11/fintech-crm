import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from 'recharts';
import { AlertTriangle, Activity, TrendingUp, Clock, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';

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
  commerce_id: number;
  commerce_name: string;
  total: number;
  tiempo_promedio_min: number;
}

export default function MonitoringPage() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [commerceId, setCommerceId] = useState('');
  const [country, setCountry] = useState('');
  const [commerces, setCommerces] = useState<any[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Data states
  const [dailyVolume, setDailyVolume] = useState<{ payin: any[]; payout: any[] }>({ payin: [], payout: [] });
  const [byCommerce, setByCommerce] = useState<{ payin: any[]; payout: any[] }>({ payin: [], payout: [] });
  const [byMethod, setByMethod] = useState<any[]>([]);
  const [approvalRate, setApprovalRate] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<{ inactivity: Alert[]; drops: Drop[]; payoutTime: PayoutTimeAlert[] }>({ inactivity: [], drops: [], payoutTime: [] });
  const [payoutTime, setPayoutTime] = useState<any[]>([]);
  const [methodsByCommerce, setMethodsByCommerce] = useState<{ payin: any[]; payout: any[] }>({ payin: [], payout: [] });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (commerceId) params.commerce_id = commerceId;
      if (country) params.country = country;

      const [vol, comm, meth, appr, alrt, pTime, methComm] = await Promise.all([
        api.get('/monitoring/daily-volume', { params }),
        api.get('/monitoring/by-commerce', { params }),
        api.get('/monitoring/by-method', { params }),
        api.get('/monitoring/approval-rate', { params }),
        api.get('/monitoring/alerts'),
        api.get('/monitoring/payout-time', { params }),
        api.get('/monitoring/methods-by-commerce'),
      ]);

      setDailyVolume(vol.data);
      setByCommerce(comm.data);
      setByMethod(meth.data);
      setApprovalRate(appr.data);
      setAlerts(alrt.data);
      setPayoutTime(pTime.data);
      setMethodsByCommerce(methComm.data);
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

  useEffect(() => { fetchData(); }, [fetchData]);

  // Combinar payin/payout para gráfico diario
  const dailyChartData = (() => {
    const map = new Map<string, any>();
    dailyVolume.payin.forEach((d: any) => {
      map.set(d.fecha?.slice(0, 10), { fecha: d.fecha?.slice(0, 10), payin_cantidad: Number(d.cantidad), payin_monto: Number(d.monto), payout_cantidad: 0, payout_monto: 0 });
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

  // Matriz de métodos por comercio
  const methodMatrix = (() => {
    const commerceMap = new Map<string, { name: string; methods: Set<string> }>();
    const allPayinMethods = new Set<string>();
    const allPayoutMethods = new Set<string>();

    methodsByCommerce.payin?.forEach((r: any) => {
      const key = String(r.commerce_id);
      if (!commerceMap.has(key)) commerceMap.set(key, { name: r.commerce_name || `#${r.commerce_id}`, methods: new Set() });
      commerceMap.get(key)!.methods.add('payin_' + r.method);
      allPayinMethods.add(r.method);
    });
    methodsByCommerce.payout?.forEach((r: any) => {
      const key = String(r.commerce_id);
      if (!commerceMap.has(key)) commerceMap.set(key, { name: r.commerce_name || `#${r.commerce_id}`, methods: new Set() });
      commerceMap.get(key)!.methods.add('payout_' + r.method);
      allPayoutMethods.add(r.method);
    });

    return { commerceMap, allPayinMethods: Array.from(allPayinMethods), allPayoutMethods: Array.from(allPayoutMethods) };
  })();

  const formatMoney = (v: number) => {
    if (v >= 1000000) return '$' + (v / 1000000).toFixed(2) + 'M';
    if (v >= 1000) return '$' + (v / 1000).toFixed(1) + 'K';
    return '$' + v.toFixed(0);
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
          Actualizar
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
          <label className="block text-xs font-medium text-gray-600 mb-1">Comercio</label>
          <select value={commerceId} onChange={e => setCommerceId(e.target.value)} className="input-field text-sm">
            <option value="">Todos</option>
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
                <span><strong>{a.commerce_name}</strong> — Payout promedio {a.tiempo_promedio_min} min</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gráfico principal: Volumen diario */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-600" /> Evolutivo TPV y # Trx por Día
        </h3>
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={dailyChartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" tickFormatter={formatMoney} />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip formatter={(value: any, name: string) => {
              if (name.includes('monto')) return [formatMoney(Number(value)), name.includes('payin') ? 'Monto Payin' : 'Monto Payout'];
              return [Number(value).toLocaleString(), name.includes('payin') ? 'Cant. Payin' : 'Cant. Payout'];
            }} />
            <Legend />
            <Bar yAxisId="left" dataKey="payin_monto" name="Monto Payin" fill="#1E3A5F" />
            <Bar yAxisId="left" dataKey="payout_monto" name="Monto Payout" fill="#60A5FA" />
            <Line yAxisId="right" type="monotone" dataKey="payin_cantidad" name="Cant. Payin" stroke="#F59E0B" strokeWidth={2} dot={false} />
            <Line yAxisId="right" type="monotone" dataKey="payout_cantidad" name="Cant. Payout" stroke="#10B981" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Por Comercio */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Payin por Comercio</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {byCommerce.payin.slice(0, 20).map((c: any, i: number) => (
              <div key={i} className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm font-medium">{c.commerce_name || `#${c.commerce_id}`}</span>
                <div className="text-right">
                  <span className="text-sm font-bold text-blue-700">{formatMoney(Number(c.monto))}</span>
                  <span className="text-xs text-gray-500 ml-2">({Number(c.cantidad).toLocaleString()} trx)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Payout por Comercio</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {byCommerce.payout.slice(0, 20).map((c: any, i: number) => (
              <div key={i} className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm font-medium">{c.commerce_name || `#${c.commerce_id}`}</span>
                <div className="text-right">
                  <span className="text-sm font-bold text-green-700">{formatMoney(Number(c.monto))}</span>
                  <span className="text-xs text-gray-500 ml-2">({Number(c.cantidad).toLocaleString()} trx)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tasa de Aprobación */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-600" /> Tasa de Aprobación por Método de Pago
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={approvalRate.slice(0, 15)} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" domain={[0, 100]} tickFormatter={v => v + '%'} />
            <YAxis type="category" dataKey="method" width={150} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: any) => [v + '%', 'Tasa Aprobación']} />
            <Bar dataKey="tasa_aprobacion" fill="#10B981" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Por Método de Pago */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Volumen por Método de Pago (Payin)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-2">Método</th>
                <th className="text-right p-2">Transacciones</th>
                <th className="text-right p-2">Monto</th>
                <th className="text-right p-2">Aprobadas</th>
                <th className="text-right p-2">Rechazadas</th>
                <th className="text-right p-2">Tasa Aprob.</th>
              </tr>
            </thead>
            <tbody>
              {byMethod.map((m: any, i: number) => {
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
                        {rate}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tiempo de Payouts */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-orange-600" /> Tiempo de Payouts por Comercio
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-2">Comercio</th>
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
                  <td className="p-2 font-medium">{p.commerce_name || `#${p.commerce_id}`}</td>
                  <td className="p-2 text-right">{Number(p.total).toLocaleString()}</td>
                  <td className="p-2 text-right font-semibold">{p.tiempo_promedio_min} min</td>
                  <td className="p-2 text-right">{p.tiempo_min} min</td>
                  <td className="p-2 text-right">{p.tiempo_max} min</td>
                  <td className="p-2 text-center">
                    {Number(p.tiempo_promedio_min) <= 15 ? (
                      <span className="inline-flex items-center gap-1 text-green-600"><CheckCircle className="w-4 h-4" /> OK</span>
                    ) : Number(p.tiempo_promedio_min) <= 60 ? (
                      <span className="inline-flex items-center gap-1 text-yellow-600"><Clock className="w-4 h-4" /> Lento</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-600"><AlertTriangle className="w-4 h-4" /> Crítico</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Matriz MDP por Comercio */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-blue-600" /> Métodos de Pago Activos por Comercio (últimos 30 días)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-2 sticky left-0 bg-gray-50 z-10">Comercio</th>
                {methodMatrix.allPayinMethods.map(m => (
                  <th key={`pi-${m}`} className="p-1 text-center whitespace-nowrap" title={m}>
                    <div className="writing-mode-vertical text-[10px]">{m.length > 12 ? m.slice(0, 12) + '…' : m}</div>
                  </th>
                ))}
                <th className="p-1 bg-gray-200">|</th>
                {methodMatrix.allPayoutMethods.map(m => (
                  <th key={`po-${m}`} className="p-1 text-center whitespace-nowrap" title={m}>
                    <div className="writing-mode-vertical text-[10px]">{m.length > 12 ? m.slice(0, 12) + '…' : m}</div>
                  </th>
                ))}
              </tr>
              <tr className="bg-blue-50">
                <th className="text-left p-1 sticky left-0 bg-blue-50 z-10 text-xs">TIPO</th>
                {methodMatrix.allPayinMethods.map(m => (
                  <th key={`pi-h-${m}`} className="p-1 text-center text-[10px] text-blue-700">PAYIN</th>
                ))}
                <th className="p-1 bg-gray-200"></th>
                {methodMatrix.allPayoutMethods.map(m => (
                  <th key={`po-h-${m}`} className="p-1 text-center text-[10px] text-green-700">PAYOUT</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from(methodMatrix.commerceMap.entries()).map(([id, data]) => (
                <tr key={id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-2 font-medium sticky left-0 bg-white z-10 whitespace-nowrap">{data.name}</td>
                  {methodMatrix.allPayinMethods.map(m => (
                    <td key={`${id}-pi-${m}`} className="p-1 text-center">
                      {data.methods.has('payin_' + m) ? (
                        <span className="inline-block w-4 h-4 bg-green-500 rounded-sm text-white text-[10px] leading-4">✓</span>
                      ) : (
                        <span className="inline-block w-4 h-4 bg-gray-200 rounded-sm"></span>
                      )}
                    </td>
                  ))}
                  <td className="p-1 bg-gray-100"></td>
                  {methodMatrix.allPayoutMethods.map(m => (
                    <td key={`${id}-po-${m}`} className="p-1 text-center">
                      {data.methods.has('payout_' + m) ? (
                        <span className="inline-block w-4 h-4 bg-blue-500 rounded-sm text-white text-[10px] leading-4">✓</span>
                      ) : (
                        <span className="inline-block w-4 h-4 bg-gray-200 rounded-sm"></span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
