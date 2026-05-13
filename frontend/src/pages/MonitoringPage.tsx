import { useState, useEffect, useCallback, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Line } from 'recharts';
import { Activity, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';

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

  // Cargar países al inicio
  useEffect(() => {
    api.get('/monitoring/countries').then(r => setCountries(r.data || [])).catch(() => {});
    // Cancelar requests pendientes al desmontar
    return () => { controllerRef.current?.abort(); };
  }, []);

  // Cuando cambia el país, cargar comercios de ese país
  useEffect(() => {
    if (!country) { setCommerces([]); setCommerceId(''); return; }
    api.get('/monitoring/commerces', { params: { country } })
      .then(r => { setCommerces(r.data || []); setCommerceId(''); })
      .catch(() => setCommerces([]));
  }, [country]);

  const fetchData = useCallback(async () => {
    if (!commerceId) {
      toast.error('Selecciona un comercio');
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const r = await api.get('/monitoring/daily-volume', {
        params: { commerce_id: commerceId, date_from: dateFrom, date_to: dateTo },
        signal: controller.signal,
      });
      const { payin, payout, currency: cur } = r.data;
      setCurrency(cur || 'USD');

      // Combinar payin y payout por fecha
      const map = new Map<string, any>();
      (payin || []).forEach((d: any) => {
        const key = d.fecha?.slice(0, 10);
        map.set(key, {
          fecha: key,
          payin_monto: Number(d.monto),
          payin_cantidad: Number(d.cantidad),
          payout_monto: 0,
          payout_cantidad: 0,
        });
      });
      (payout || []).forEach((d: any) => {
        const key = d.fecha?.slice(0, 10);
        const existing = map.get(key) || { fecha: key, payin_monto: 0, payin_cantidad: 0, payout_monto: 0, payout_cantidad: 0 };
        existing.payout_monto = Number(d.monto);
        existing.payout_cantidad = Number(d.cantidad);
        map.set(key, existing);
      });

      setChartData(Array.from(map.values()).sort((a, b) => a.fecha.localeCompare(b.fecha)));
    } catch (err: any) {
      if (err.name !== 'CanceledError' && err.code !== 'ERR_CANCELED') {
        toast.error('Error al cargar datos');
      }
    } finally {
      setLoading(false);
    }
  }, [commerceId, dateFrom, dateTo]);

  const formatMoney = (v: number) => {
    const sym = currency === 'PEN' ? 'S/' : currency === 'CLP' ? '$' : currency === 'MXN' ? '$' : currency === 'COP' ? '$' : currency === 'BRL' ? 'R$' : '$';
    if (v >= 1000000) return sym + (v / 1000000).toFixed(2) + 'M';
    if (v >= 1000) return sym + (v / 1000).toFixed(1) + 'K';
    return sym + v.toFixed(0);
  };

  const formatCant = (v: number) => {
    if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
    return v.toString();
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

      {/* Gráfico Evolutivo TPV y # Trx por Día */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-600" />
            Evolutivo TPV y # Trx por Día ({currency})
          </h3>
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="fecha"
                tick={{ fontSize: 10, angle: -45, textAnchor: 'end' }}
                height={60}
                tickFormatter={(v) => {
                  const d = new Date(v + 'T00:00:00');
                  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
                }}
              />
              <YAxis yAxisId="left" tickFormatter={formatMoney} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={formatCant} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: any, name: string) => {
                  if (name === 'Monto Payin' || name === 'Monto Payout') return [formatMoney(Number(value)), name];
                  return [Number(value).toLocaleString(), name];
                }}
                labelFormatter={(label) => {
                  const d = new Date(label + 'T00:00:00');
                  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
                }}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="payin_monto" name="Monto Payin" fill="#1E3A5F" radius={[2, 2, 0, 0]} />
              <Bar yAxisId="left" dataKey="payout_monto" name="Monto Payout" fill="#93C5FD" radius={[2, 2, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="payin_cantidad" name="Cant. Payin" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} />
              <Line yAxisId="right" type="monotone" dataKey="payout_cantidad" name="Cant. Payout" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
