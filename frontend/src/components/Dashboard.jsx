import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { metricsApi } from '../services/api';
import { EnergyAreaChart, EnergyBySourceChart, RenewableRatioChart, CarbonLineChart } from './MetricsChart';
import AlertsPanel from './AlertsPanel';

const s = {
  page: { minHeight: '100vh', background: '#0f172a', color: '#e2e8f0' },
  nav: { background: '#1e293b', borderBottom: '1px solid #334155', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 },
  logo: { display: 'flex', alignItems: 'center', gap: 10 },
  logoText: { fontSize: 20, fontWeight: 800, color: '#16a34a' },
  navRight: { display: 'flex', alignItems: 'center', gap: 16 },
  badge: { background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.3)', borderRadius: 20, padding: '4px 12px', fontSize: 12, color: '#4ade80' },
  logoutBtn: { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '6px 14px', color: '#f87171', fontSize: 13, cursor: 'pointer' },
  main: { padding: '32px 24px', maxWidth: 1400, margin: '0 auto' },
  sectionTitle: { fontSize: 14, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 20 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 },
  statCard: { background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '20px 24px' },
  statLabel: { fontSize: 12, color: '#64748b', marginBottom: 6, fontWeight: 500 },
  statValue: { fontSize: 28, fontWeight: 700, color: '#f1f5f9', lineHeight: 1 },
  statUnit: { fontSize: 13, color: '#64748b', marginTop: 4 },
  statTrend: { fontSize: 12, marginTop: 8 },
  chartsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: 20, marginBottom: 32 },
  chartCard: { background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '24px' },
  chartTitle: { fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 4 },
  chartSub: { fontSize: 12, color: '#64748b', marginBottom: 20 },
  alertCard: { background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '24px', marginBottom: 32 },
  refreshBtn: { background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.3)', borderRadius: 8, padding: '8px 16px', color: '#4ade80', fontSize: 13, cursor: 'pointer', marginLeft: 12 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 },
  headerTitle: { fontSize: 24, fontWeight: 700, color: '#f1f5f9' },
  headerSub: { fontSize: 14, color: '#64748b', marginTop: 4 }
};

function StatCard({ label, value, unit, color = '#16a34a', icon, trend }) {
  return (
    <div style={s.statCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={s.statLabel}>{label}</div>
        <div style={{ fontSize: 22 }}>{icon}</div>
      </div>
      <div style={{ ...s.statValue, color }}>{value}</div>
      <div style={s.statUnit}>{unit}</div>
      {trend && <div style={{ ...s.statTrend, color: trend.up ? '#4ade80' : '#f87171' }}>{trend.up ? '↑' : '↓'} {trend.text}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [energyData, setEnergyData] = useState([]);
  const [historyData, setHistoryData] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchAll = useCallback(async () => {
    try {
      const [summaryRes, energyRes, historyRes, alertsRes] = await Promise.allSettled([
        metricsApi.getSummary(),
        metricsApi.getEnergy(),
        metricsApi.getHistory({ limit: 100 }),
        metricsApi.getAlerts()
      ]);
      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value.data.data);
      if (energyRes.status === 'fulfilled') setEnergyData(energyRes.value.data.data || []);
      if (historyRes.status === 'fulfilled') setHistoryData(historyRes.value.data.data || []);
      if (alertsRes.status === 'fulfilled') setAlerts(alertsRes.value.data.data || []);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Failed to fetch metrics', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const activeAlerts = alerts.filter((a) => !a.resolved);

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <div style={s.logo}>
          <span style={{ fontSize: 28 }}>🌿</span>
          <span style={s.logoText}>GreenOps Platform</span>
        </div>
        <div style={s.navRight}>
          <span style={s.badge}>{user?.role === 'admin' ? '🛡️ Admin' : '👤 User'} — {user?.email}</span>
          {activeAlerts.length > 0 && (
            <span style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 20, padding: '4px 12px', fontSize: 12, color: '#f87171' }}>
              🔔 {activeAlerts.length} alerte{activeAlerts.length > 1 ? 's' : ''}
            </span>
          )}
          <button onClick={handleLogout} style={s.logoutBtn}>Déconnexion</button>
        </div>
      </nav>

      <main style={s.main}>
        <div style={s.header}>
          <div>
            <div style={s.headerTitle}>Tableau de bord énergétique</div>
            <div style={s.headerSub}>
              Dernière mise à jour : {lastRefresh.toLocaleTimeString('fr-FR')} · Actualisation auto toutes les 30s
            </div>
          </div>
          <button onClick={fetchAll} style={s.refreshBtn} disabled={loading}>
            {loading ? '⟳ Chargement...' : '⟳ Actualiser'}
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <div style={{ fontSize: 14, color: '#64748b' }}>Chargement des métriques...</div>
          </div>
        ) : (
          <>
            <div style={s.sectionTitle}>Indicateurs clés</div>
            <div style={s.statsGrid}>
              <StatCard
                label="Consommation totale"
                value={summary ? (summary.totalEnergyKwh / 1000).toFixed(1) : '—'}
                unit="MWh aujourd'hui"
                icon="⚡"
                color="#f59e0b"
                trend={{ up: false, text: '-3.2% vs hier' }}
              />
              <StatCard
                label="Énergie renouvelable"
                value={summary ? (summary.renewableRatio * 100).toFixed(1) : '—'}
                unit="% du mix énergétique"
                icon="🌱"
                color="#16a34a"
                trend={{ up: true, text: '+5.1% vs hier' }}
              />
              <StatCard
                label="Émissions CO2"
                value={summary ? (summary.carbonEmissionsGco2 / 1000).toFixed(2) : '—'}
                unit="tCO2eq aujourd'hui"
                icon="💨"
                color="#ef4444"
                trend={{ up: false, text: '-8.7% vs hier' }}
              />
              <StatCard
                label="Énergie économisée"
                value={summary ? (summary.energySavedKwh / 1000).toFixed(1) : '—'}
                unit="MWh ce mois"
                icon="💡"
                color="#0ea5e9"
                trend={{ up: true, text: '+12.4% vs mois dernier' }}
              />
              <StatCard
                label="Alertes actives"
                value={activeAlerts.length}
                unit={`sur ${alerts.length} total`}
                icon={activeAlerts.length > 0 ? '🔔' : '✅'}
                color={activeAlerts.length > 0 ? '#ef4444' : '#16a34a'}
              />
              <StatCard
                label="Zones surveillées"
                value={summary?.zones || 3}
                unit="zones actives"
                icon="🗺️"
                color="#8b5cf6"
              />
            </div>

            <div style={s.sectionTitle}>Métriques en temps réel</div>
            <div style={s.chartsGrid}>
              <div style={s.chartCard}>
                <div style={s.chartTitle}>Consommation & Émissions</div>
                <div style={s.chartSub}>Évolution sur les dernières heures</div>
                <EnergyAreaChart data={historyData} />
              </div>
              <div style={s.chartCard}>
                <div style={s.chartTitle}>Consommation par source</div>
                <div style={s.chartSub}>Répartition du mix énergétique actuel</div>
                <EnergyBySourceChart data={energyData} />
              </div>
              <div style={s.chartCard}>
                <div style={s.chartTitle}>Taux renouvelable par zone</div>
                <div style={s.chartSub}>Pourcentage d'énergie verte par zone géographique</div>
                <RenewableRatioChart data={energyData} />
              </div>
              <div style={s.chartCard}>
                <div style={s.chartTitle}>Émissions CO2 (timeline)</div>
                <div style={s.chartSub}>Évolution des émissions en gCO2eq</div>
                <CarbonLineChart data={historyData} />
              </div>
            </div>

            <div style={s.sectionTitle}>Alertes & Incidents</div>
            <div style={s.alertCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9' }}>Gestionnaire d'alertes</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    {activeAlerts.length} alerte{activeAlerts.length !== 1 ? 's' : ''} active{activeAlerts.length !== 1 ? 's' : ''} · seuils critiques surveillés en temps réel
                  </div>
                </div>
              </div>
              <AlertsPanel alerts={alerts} onRefresh={fetchAll} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
