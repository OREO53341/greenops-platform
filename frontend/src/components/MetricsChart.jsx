import React from 'react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const COLORS = ['#16a34a', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <p style={{ color: '#94a3b8', marginBottom: 6 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, margin: '2px 0' }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</strong>
          {p.name?.includes('kwh') || p.name?.includes('kWh') ? ' kWh' : ''}
          {p.name?.includes('carbon') || p.name?.includes('CO2') ? ' gCO2' : ''}
        </p>
      ))}
    </div>
  );
};

export function EnergyAreaChart({ data }) {
  const formatted = data.slice(-48).map((d) => ({
    time: new Date(d.recorded_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    'Consommation (kWh)': d.value_kwh,
    'Émissions CO2': d.carbon_gco2
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={formatted}>
        <defs>
          <linearGradient id="colorEnergy" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorCarbon" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} interval={7} />
        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
        <Area type="monotone" dataKey="Consommation (kWh)" stroke="#16a34a" strokeWidth={2} fill="url(#colorEnergy)" />
        <Area type="monotone" dataKey="Émissions CO2" stroke="#f59e0b" strokeWidth={2} fill="url(#colorCarbon)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function EnergyBySourceChart({ data }) {
  const sources = ['solar', 'wind', 'grid', 'hydro'];
  const aggregated = sources.map((source) => {
    const items = data.filter((d) => d.source === source);
    const total = items.reduce((sum, d) => sum + d.value_kwh, 0);
    return { source, total: parseFloat(total.toFixed(2)) };
  });

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={aggregated} barSize={36}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis dataKey="source" tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} />
        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="total" name="Énergie (kWh)" fill="#16a34a" radius={[4, 4, 0, 0]}>
          {aggregated.map((_, i) => (
            <rect key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RenewableRatioChart({ data }) {
  const zones = ['zone-a', 'zone-b', 'zone-c'];
  const byZone = zones.map((zone) => {
    const items = data.filter((d) => d.zone === zone);
    const avg = items.length ? items.reduce((s, d) => s + d.renewable_ratio, 0) / items.length : 0;
    return { zone, ratio: parseFloat((avg * 100).toFixed(1)) };
  });

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={byZone} layout="vertical" barSize={28}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} unit="%" />
        <YAxis dataKey="zone" type="category" tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} width={60} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="ratio" name="Énergie renouvelable (%)" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CarbonLineChart({ data }) {
  const formatted = data.slice(-24).map((d) => ({
    time: new Date(d.recorded_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    'gCO2eq': d.carbon_gco2
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={formatted}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} interval={5} />
        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
        <Line type="monotone" dataKey="gCO2eq" stroke="#ef4444" strokeWidth={2} dot={false} name="Émissions CO2" />
      </LineChart>
    </ResponsiveContainer>
  );
}
