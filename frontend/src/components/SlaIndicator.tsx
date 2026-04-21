import { useState } from 'react';
import { Clock, AlertTriangle, XCircle, CheckCircle } from 'lucide-react';
import { SlaEvalResult } from '../types';

interface Props {
  result: SlaEvalResult | undefined;
  size?: 'sm' | 'md';
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
  const days = Math.floor(hours / 24);
  const rem  = Math.round(hours % 24);
  return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
}

export default function SlaIndicator({ result, size = 'sm' }: Props) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!result || result.status === 'excluded') return null;

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  const config = {
    ok: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-200',
      icon: <CheckCircle className={`${iconSize} text-emerald-600`} />,
      label: 'OK',
    },
    warning: {
      bg: 'bg-orange-50',
      text: 'text-orange-700',
      border: 'border-orange-200',
      icon: <AlertTriangle className={`${iconSize} text-orange-500`} />,
      label: 'SLA',
    },
    breached: {
      bg: 'bg-red-50',
      text: 'text-red-700',
      border: 'border-red-200',
      icon: <XCircle className={`${iconSize} text-red-500`} />,
      label: 'SLA',
    },
  }[result.status];

  const isMerchant = result.entity_type === 'merchant';

  return (
    <div className="relative inline-flex" onMouseEnter={() => setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)}>
      {/* Badge */}
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium border cursor-default
        ${config.bg} ${config.text} ${config.border}`}>
        {config.icon}
        {result.status !== 'ok' && <span>{config.label}</span>}
      </span>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-64
          bg-gray-900 text-white text-xs rounded-xl shadow-xl p-3 pointer-events-none">
          <div className="space-y-1.5">
            <p className="font-semibold text-white border-b border-gray-700 pb-1.5 mb-1.5">
              Estado SLA: {result.status === 'ok' ? '✅ Dentro del plazo' : result.status === 'warning' ? '⚠️ Próximo a vencer' : '🔴 Incumplido'}
            </p>

            <div className="flex justify-between">
              <span className="text-gray-400">Tiempo transcurrido</span>
              <span className="font-medium">{formatHours(result.hours_elapsed)}</span>
            </div>

            {isMerchant && result.sla_by_status !== null && (
              <div className="flex justify-between">
                <span className="text-gray-400">SLA por estado</span>
                <span className="font-medium">{formatHours(result.sla_by_status)}</span>
              </div>
            )}

            {isMerchant && result.sla_by_risk !== null && (
              <div className="flex justify-between">
                <span className="text-gray-400">SLA por riesgo</span>
                <span className="font-medium">{formatHours(result.sla_by_risk)}</span>
              </div>
            )}

            {result.effective_sla_hours !== null && (
              <div className="flex justify-between border-t border-gray-700 pt-1.5 mt-1.5">
                <span className="text-gray-300 font-medium">SLA efectivo</span>
                <span className="font-bold text-white">{formatHours(result.effective_sla_hours)}</span>
              </div>
            )}

            {result.status === 'ok' && result.hours_remaining !== null && (
              <div className="flex justify-between">
                <span className="text-gray-400">Tiempo restante</span>
                <span className="font-medium text-emerald-400">{formatHours(result.hours_remaining)}</span>
              </div>
            )}

            {result.status === 'warning' && result.hours_remaining !== null && (
              <div className="flex justify-between">
                <span className="text-gray-400">Tiempo restante</span>
                <span className="font-medium text-orange-400">{formatHours(result.hours_remaining)}</span>
              </div>
            )}

            {result.status === 'breached' && result.effective_sla_hours !== null && (
              <div className="flex justify-between">
                <span className="text-gray-400">Tiempo de retraso</span>
                <span className="font-medium text-red-400">
                  +{formatHours(result.hours_elapsed - result.effective_sla_hours)}
                </span>
              </div>
            )}
          </div>
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
}
