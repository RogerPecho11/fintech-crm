import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Shield, Save, RotateCcw, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { useSlaConfig } from '../lib/hooks/useSlaStatus';
import { SlaConfigEntry } from '../types';
import { getStatuses, getRiskLevels } from '../lib/config';
import toast from 'react-hot-toast';

type TabKey = 'merchant_status' | 'risk_level' | 'task_priority' | 'global' | 'risk_score';

const TAB_LABELS: Record<TabKey, string> = {
  merchant_status: 'SLA por Estado',
  risk_level:      'SLA por Nivel de Riesgo',
  task_priority:   'SLA por Prioridad de Tarea',
  global:          'Umbral de Alerta',
  risk_score:      'Score de Riesgo',
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: '🔴 Urgente', high: '🟠 Alta', medium: '🔵 Media', low: '⚪ Baja',
};

function getLabel(entityType: TabKey, entityKey: string): string {
  if (entityType === 'merchant_status') {
    const status = getStatuses().find(s => s.value === entityKey);
    return status?.label || entityKey;
  }
  if (entityType === 'risk_level') {
    const risk = getRiskLevels().find(r => r.value === entityKey);
    return risk ? `${risk.icon} ${risk.label}` : entityKey;
  }
  if (entityType === 'task_priority') return PRIORITY_LABELS[entityKey] || entityKey;
  return entityKey;
}

export default function SlaPanel() {
  const queryClient = useQueryClient();
  const { data: config, isLoading, isError, refetch } = useSlaConfig();
  const [activeTab, setActiveTab] = useState<TabKey>('merchant_status');
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Initialize local values from config
  useEffect(() => {
    if (!config) return;
    const vals: Record<string, string> = {};
    config.forEach(entry => {
      const key = `${entry.entity_type}__${entry.entity_key}`;
      if (entry.entity_type === 'global') {
        vals[key] = entry.alert_threshold_pct !== null ? String(entry.alert_threshold_pct) : '';
      } else {
        vals[key] = entry.max_hours !== null ? String(entry.max_hours) : '';
      }
    });
    setLocalValues(vals);
  }, [config]);

  const getValue = (entityType: string, entityKey: string) =>
    localValues[`${entityType}__${entityKey}`] ?? '';

  const setValue = (entityType: string, entityKey: string, val: string) => {
    setLocalValues(prev => ({ ...prev, [`${entityType}__${entityKey}`]: val }));
  };

  const getEntriesForTab = (tab: TabKey): SlaConfigEntry[] => {
    const dbEntries = config ? config.filter(e => e.entity_type === tab) : [];

    // Para merchant_status y risk_level, sincronizar con los estados/riesgos dinámicos
    if (tab === 'merchant_status') {
      const allStatuses = getStatuses();
      const entries: SlaConfigEntry[] = allStatuses.map(s => {
        const existing = dbEntries.find(e => e.entity_key === s.value);
        return existing || {
          entity_type: 'merchant_status' as const,
          entity_key: s.value,
          max_hours: null,
          alert_threshold_pct: null,
        };
      });
      return entries;
    }

    if (tab === 'risk_level') {
      const allRisks = getRiskLevels();
      const entries: SlaConfigEntry[] = allRisks.map(r => {
        const existing = dbEntries.find(e => e.entity_key === r.value);
        return existing || {
          entity_type: 'risk_level' as const,
          entity_key: r.value,
          max_hours: null,
          alert_threshold_pct: null,
        };
      });
      return entries;
    }

    return dbEntries;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const entries = getEntriesForTab(activeTab).map(entry => {
        const raw = getValue(entry.entity_type, entry.entity_key);
        const num = raw === '' ? null : parseFloat(raw);
        if (entry.entity_type === 'global') {
          return { entity_type: entry.entity_type, entity_key: entry.entity_key, max_hours: null, alert_threshold_pct: num };
        }
        return { entity_type: entry.entity_type, entity_key: entry.entity_key, max_hours: num, alert_threshold_pct: null };
      });

      await api.put('/sla/config', entries);
      queryClient.invalidateQueries({ queryKey: ['sla', 'config'] });
      queryClient.invalidateQueries({ queryKey: ['sla', 'status'] });
      toast.success('Configuración SLA guardada');
    } catch (err: any) {
      const errors = err.response?.data?.errors;
      if (errors?.length) {
        errors.forEach((e: string) => toast.error(e, { duration: 5000 }));
      } else {
        toast.error(err.response?.data?.error || 'Error al guardar');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await api.post(`/sla/config/reset/${activeTab}`);
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['sla', 'status'] });
      toast.success('Valores predeterminados restaurados');
    } catch {
      toast.error('Error al restaurar valores');
    } finally {
      setResetting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-24">
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#FC2B5F', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-6">
        <p className="text-red-500 text-sm mb-2">Error al cargar la configuración SLA</p>
        <button onClick={() => refetch()} className="btn-secondary text-sm">Reintentar</button>
      </div>
    );
  }

  const tabEntries = getEntriesForTab(activeTab);

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {(Object.keys(TAB_LABELS) as TabKey[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === tab ? 'border-transparent' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            style={activeTab === tab ? { color: '#FC2B5F', borderColor: '#FC2B5F' } : undefined}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="space-y-3">
        {activeTab === 'risk_score' ? (
          // Score de Riesgo — editable
          <RiskScoreConfig />
        ) : activeTab === 'global' ? (
          // Umbral de alerta — single field
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Porcentaje del tiempo total del SLA a partir del cual se envía la alerta de advertencia.
              Por ejemplo, con 75% y un SLA de 48h, la alerta se envía a las 36h.
            </p>
            {tabEntries.map(entry => (
              <div key={entry.entity_key} className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-700 w-40">Umbral de alerta</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={10}
                    max={90}
                    className="input w-24 text-sm"
                    value={getValue(entry.entity_type, entry.entity_key)}
                    onChange={e => setValue(entry.entity_type, entry.entity_key, e.target.value)}
                    placeholder="75"
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
                <p className="text-xs text-gray-400">Rango: 10% – 90%</p>
              </div>
            ))}
          </div>
        ) : (
          // Table for status / risk / priority
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {activeTab === 'merchant_status' ? 'Estado' : activeTab === 'risk_level' ? 'Nivel de Riesgo' : 'Prioridad'}
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-48">
                    Horas máximas
                  </th>
                  <th className="px-4 py-2.5 text-xs text-gray-400 text-right">
                    Vacío = sin SLA
                  </th>
                </tr>
              </thead>
              <tbody>
                {tabEntries.map((entry, i) => (
                  <tr key={entry.entity_key} className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                    <td className="px-4 py-2.5 font-medium text-gray-800">
                      {getLabel(activeTab, entry.entity_key)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={720}
                          className="input w-24 text-sm"
                          value={getValue(entry.entity_type, entry.entity_key)}
                          onChange={e => setValue(entry.entity_type, entry.entity_key, e.target.value)}
                          placeholder="—"
                        />
                        <span className="text-xs text-gray-400">horas</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {getValue(entry.entity_type, entry.entity_key) && (
                        <span className="text-xs text-gray-400">
                          ≈ {Math.round(parseFloat(getValue(entry.entity_type, entry.entity_key)) / 24 * 10) / 10}d
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {tabEntries.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-gray-400 text-sm">
                      No hay entradas configuradas para esta sección.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={handleReset}
            disabled={resetting}
            className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50"
          >
            {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            Restaurar predeterminados
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Componente: Configuración de Score de Riesgo ────────────────────────────
function RiskScoreConfig() {
  const [scores, setScores] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/config/risk-scores').then(res => {
      const data = res.data || {};
      const vals: Record<string, string> = {};
      Object.entries(data).forEach(([key, val]) => { vals[key] = String(val); });
      setScores(vals);
    }).catch(() => {
      setScores({ diamond: '10', gold: '8', silver: '6', bronze: '3', low: '10', medium: '7', high: '3', critical: '0', min_score_finalized: '80' });
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, number> = {};
      Object.entries(scores).forEach(([key, val]) => {
        payload[key] = val === '' ? 0 : parseInt(val);
      });
      await api.put('/config/risk-scores', payload);
      toast.success('Score de riesgo guardado');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>;

  const riskLevels = getRiskLevels();

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Define cuántos puntos aporta cada nivel de riesgo al Score total del comercio (máximo 10 puntos).
        Un nivel más alto de confianza (diamond) debería tener más puntos.
      </p>

      {/* Score mínimo para finalizar */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-amber-800">Score mínimo para finalizar</p>
            <p className="text-xs text-amber-600">El comercio necesita este score mínimo para poder cambiar a estado "Finalizado"</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              className="input w-20 text-sm text-center font-bold"
              value={scores['min_score_finalized'] ?? '80'}
              onChange={e => setScores(prev => ({ ...prev, min_score_finalized: e.target.value }))}
            />
            <span className="text-sm text-amber-700">/ 100</span>
          </div>
        </div>
      </div>

      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Nivel de Riesgo</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase w-40">Puntos (0-10)</th>
              <th className="px-4 py-2.5 text-xs text-gray-400 text-right">Descripción</th>
            </tr>
          </thead>
          <tbody>
            {riskLevels.map((risk, i) => (
              <tr key={risk.value} className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                <td className="px-4 py-2.5 font-medium text-gray-800">
                  {risk.icon} {risk.label}
                </td>
                <td className="px-4 py-2.5">
                  <input
                    type="number"
                    min={0}
                    max={10}
                    className="input w-20 text-sm"
                    value={scores[risk.value] ?? ''}
                    onChange={e => setScores(prev => ({ ...prev, [risk.value]: e.target.value }))}
                    placeholder="0"
                  />
                </td>
                <td className="px-4 py-2.5 text-right text-xs text-gray-400">
                  {parseInt(scores[risk.value] || '0') >= 8 ? 'Bajo riesgo' :
                   parseInt(scores[risk.value] || '0') >= 5 ? 'Riesgo moderado' :
                   'Alto riesgo'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end pt-2">
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Guardar Score de Riesgo
        </button>
      </div>
    </div>
  );
}
