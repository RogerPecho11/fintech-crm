import { useState, useEffect, useCallback } from 'react';
import { Database, X, RefreshCw, Trash2, AlertTriangle, CheckCircle, Activity } from 'lucide-react';
import api from '../lib/api';

interface CacheStats {
  cache: {
    entries: number;
    memoryMB: string;
    maxEntries: number;
    maxMemoryMB: number;
  };
  rateLimit: {
    queriesInWindow: number;
    maxPerWindow: number;
    windowResetIn: number;
  };
}

export default function DbResourceMonitor() {
  const [isOpen, setIsOpen] = useState(false);
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [pulseColor, setPulseColor] = useState<'green' | 'yellow' | 'red'>('green');

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/monitoring/cache-stats');
      setStats(res.data);

      // Determinar color según uso
      const usage = res.data.rateLimit.queriesInWindow / res.data.rateLimit.maxPerWindow;
      if (usage > 0.8) setPulseColor('red');
      else if (usage > 0.5) setPulseColor('yellow');
      else setPulseColor('green');
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, []);

  const clearCache = async () => {
    try {
      setClearing(true);
      await api.post('/monitoring/cache-clear');
      await fetchStats();
    } catch {
      // silencioso
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStats();
      const interval = setInterval(fetchStats, 5000); // Actualizar cada 5s
      return () => clearInterval(interval);
    }
  }, [isOpen, fetchStats]);

  // Polling ligero para el indicador (cada 30s)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await api.get('/monitoring/cache-stats');
        const usage = res.data.rateLimit.queriesInWindow / res.data.rateLimit.maxPerWindow;
        if (usage > 0.8) setPulseColor('red');
        else if (usage > 0.5) setPulseColor('yellow');
        else setPulseColor('green');
      } catch { /* silencioso */ }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const getColorClasses = (color: 'green' | 'yellow' | 'red') => {
    switch (color) {
      case 'green': return { bg: 'bg-emerald-500', ring: 'ring-emerald-400', text: 'text-emerald-600' };
      case 'yellow': return { bg: 'bg-amber-500', ring: 'ring-amber-400', text: 'text-amber-600' };
      case 'red': return { bg: 'bg-red-500', ring: 'ring-red-400', text: 'text-red-600' };
    }
  };

  const colors = getColorClasses(pulseColor);

  const getUsagePercent = (current: number, max: number) => {
    return Math.min(100, Math.round((current / max) * 100));
  };

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 group"
        title="Monitor de recursos - Réplica MySQL"
      >
        <div className="relative">
          <Database className="w-4 h-4 text-gray-600 group-hover:text-gray-900" />
          <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${colors.bg} animate-pulse`} />
        </div>
        <span className="text-xs font-medium text-gray-600 group-hover:text-gray-900 hidden sm:inline">
          DB Réplica
        </span>
      </button>

      {/* Panel popup */}
      {isOpen && (
        <div className="fixed bottom-16 right-4 z-50 w-80 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-700" />
              <span className="text-sm font-semibold text-gray-800">Recursos MySQL Réplica</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={fetchStats}
                disabled={loading}
                className="p-1 text-gray-400 hover:text-gray-700 rounded transition-colors"
                title="Actualizar"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {!stats ? (
              <div className="text-center py-4 text-sm text-gray-500">Cargando...</div>
            ) : (
              <>
                {/* Rate Limit - Queries por minuto */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-gray-600">Queries / minuto</span>
                    <span className={`text-xs font-bold ${
                      getUsagePercent(stats.rateLimit.queriesInWindow, stats.rateLimit.maxPerWindow) > 80
                        ? 'text-red-600' : getUsagePercent(stats.rateLimit.queriesInWindow, stats.rateLimit.maxPerWindow) > 50
                        ? 'text-amber-600' : 'text-emerald-600'
                    }`}>
                      {stats.rateLimit.queriesInWindow} / {stats.rateLimit.maxPerWindow}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        getUsagePercent(stats.rateLimit.queriesInWindow, stats.rateLimit.maxPerWindow) > 80
                          ? 'bg-red-500' : getUsagePercent(stats.rateLimit.queriesInWindow, stats.rateLimit.maxPerWindow) > 50
                          ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${getUsagePercent(stats.rateLimit.queriesInWindow, stats.rateLimit.maxPerWindow)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Reset en {Math.ceil(stats.rateLimit.windowResetIn / 1000)}s
                  </p>
                </div>

                {/* Cache - Entradas */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-gray-600">Cache (entradas)</span>
                    <span className="text-xs font-bold text-gray-700">
                      {stats.cache.entries} / {stats.cache.maxEntries}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-500"
                      style={{ width: `${getUsagePercent(stats.cache.entries, stats.cache.maxEntries)}%` }}
                    />
                  </div>
                </div>

                {/* Cache - Memoria */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-gray-600">Memoria cache</span>
                    <span className="text-xs font-bold text-gray-700">
                      {stats.cache.memoryMB} MB / {stats.cache.maxMemoryMB} MB
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        getUsagePercent(parseFloat(stats.cache.memoryMB), stats.cache.maxMemoryMB) > 80
                          ? 'bg-red-500' : 'bg-purple-500'
                      }`}
                      style={{ width: `${getUsagePercent(parseFloat(stats.cache.memoryMB), stats.cache.maxMemoryMB)}%` }}
                    />
                  </div>
                </div>

                {/* Estado */}
                <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                  {pulseColor === 'green' ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                  ) : pulseColor === 'yellow' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  )}
                  <span className={`text-xs font-medium ${colors.text}`}>
                    {pulseColor === 'green' && 'Consumo normal — réplica estable'}
                    {pulseColor === 'yellow' && 'Consumo moderado — cuidado con más consultas'}
                    {pulseColor === 'red' && '⚠️ Consumo alto — riesgo de tumbar la réplica'}
                  </span>
                </div>

                {/* Botón limpiar cache */}
                <button
                  onClick={clearCache}
                  disabled={clearing}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {clearing ? 'Limpiando...' : 'Limpiar cache (forzar datos frescos)'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
