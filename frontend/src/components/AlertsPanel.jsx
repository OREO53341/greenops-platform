import React, { useState } from 'react';
import { metricsApi } from '../services/api';

const SEVERITY_COLORS = {
  critical: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', text: '#f87171', badge: '#ef4444' },
  warning: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', text: '#fbbf24', badge: '#f59e0b' },
  info: { bg: 'rgba(14,165,233,0.1)', border: 'rgba(14,165,233,0.3)', text: '#38bdf8', badge: '#0ea5e9' }
};

const SEVERITY_LABELS = { critical: 'Critique', warning: 'Attention', info: 'Info' };

export default function AlertsPanel({ alerts, onRefresh }) {
  const [resolving, setResolving] = useState(null);

  const handleResolve = async (id) => {
    setResolving(id);
    try {
      await metricsApi.resolveAlert(id);
      onRefresh();
    } catch (err) {
      console.error('Failed to resolve alert', err);
    } finally {
      setResolving(null);
    }
  };

  const active = alerts.filter((a) => !a.resolved);
  const resolved = alerts.filter((a) => a.resolved).slice(0, 5);

  return (
    <div>
      {active.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 16px', color: '#4ade80' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Aucune alerte active</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Tous les systèmes fonctionnent normalement</div>
        </div>
      )}
      {active.map((alert) => {
        const c = SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.info;
        return (
          <div key={alert.id} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: '14px 16px', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ background: c.badge, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {SEVERITY_LABELS[alert.severity] || alert.severity}
                  </span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{alert.type?.replace(/_/g, ' ')}</span>
                </div>
                <div style={{ fontSize: 13, color: c.text, fontWeight: 500, marginBottom: 4 }}>{alert.message}</div>
                <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#64748b' }}>
                  {alert.zone && <span>Zone : <strong style={{ color: '#94a3b8' }}>{alert.zone}</strong></span>}
                  {alert.current_value && <span>Valeur : <strong style={{ color: '#94a3b8' }}>{parseFloat(alert.current_value).toFixed(2)}</strong></span>}
                  {alert.threshold_value && <span>Seuil : <strong style={{ color: '#94a3b8' }}>{parseFloat(alert.threshold_value).toFixed(2)}</strong></span>}
                  <span>{new Date(alert.created_at).toLocaleString('fr-FR')}</span>
                </div>
              </div>
              <button
                onClick={() => handleResolve(alert.id)}
                disabled={resolving === alert.id}
                style={{ background: 'rgba(22,163,74,0.2)', border: '1px solid rgba(22,163,74,0.4)', borderRadius: 6, padding: '6px 12px', color: '#4ade80', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', opacity: resolving === alert.id ? 0.6 : 1 }}
              >
                {resolving === alert.id ? '...' : 'Résoudre'}
              </button>
            </div>
          </div>
        );
      })}
      {resolved.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, fontWeight: 500 }}>HISTORIQUE RÉCENT</div>
          {resolved.map((alert) => (
            <div key={alert.id} style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid #1e293b', borderRadius: 8, padding: '10px 14px', marginBottom: 8, opacity: 0.6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 11, color: '#4ade80', marginRight: 8 }}>✓ Résolu</span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{alert.message}</span>
                </div>
                <span style={{ fontSize: 11, color: '#64748b' }}>{new Date(alert.resolved_at || alert.created_at).toLocaleDateString('fr-FR')}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
