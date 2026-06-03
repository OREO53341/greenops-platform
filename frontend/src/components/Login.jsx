import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const styles = {
  page: { minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { background: '#1e293b', border: '1px solid #334155', borderRadius: 16, padding: '40px 48px', width: '100%', maxWidth: 440, boxShadow: '0 25px 50px rgba(0,0,0,0.5)' },
  logo: { textAlign: 'center', marginBottom: 32 },
  logoIcon: { fontSize: 48, marginBottom: 8 },
  logoTitle: { fontSize: 28, fontWeight: 800, color: '#16a34a', letterSpacing: '-0.5px' },
  logoSubtitle: { fontSize: 13, color: '#64748b', marginTop: 4 },
  title: { fontSize: 20, fontWeight: 600, color: '#f1f5f9', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 32 },
  field: { marginBottom: 20 },
  label: { display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 },
  input: { width: '100%', padding: '12px 14px', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 14, outline: 'none', transition: 'border-color 0.2s' },
  button: { width: '100%', padding: '13px', background: 'linear-gradient(135deg, #16a34a, #15803d)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', transition: 'opacity 0.2s', marginTop: 8 },
  buttonDisabled: { opacity: 0.6, cursor: 'not-allowed' },
  error: { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '12px 14px', color: '#f87171', fontSize: 13, marginBottom: 20 },
  demo: { background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: 8, padding: '12px 14px', marginTop: 24, fontSize: 12, color: '#4ade80' },
  demoTitle: { fontWeight: 600, marginBottom: 6 },
  spinner: { display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginRight: 8, verticalAlign: 'middle' }
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Veuillez remplir tous les champs.'); return; }
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      const msg = err.response?.data?.error || 'Identifiants invalides. Veuillez réessayer.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (role) => {
    if (role === 'admin') { setEmail('admin@greenops.local'); setPassword('Admin@GreenOps2024'); }
    else { setEmail('demo@greenops.local'); setPassword('Demo@GreenOps2024'); }
    setError('');
  };

  return (
    <div style={styles.page}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } input:focus { border-color: #16a34a !important; box-shadow: 0 0 0 3px rgba(22,163,74,0.15); }`}</style>
      <div style={styles.card}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}>🌿</div>
          <div style={styles.logoTitle}>GreenOps</div>
          <div style={styles.logoSubtitle}>Energy Metrics Platform</div>
        </div>
        <div style={styles.title}>Connexion</div>
        <div style={styles.subtitle}>Accédez à votre tableau de bord énergétique</div>
        {error && <div style={styles.error}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={styles.field}>
            <label style={styles.label}>Adresse email</label>
            <input
              style={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@greenops.local"
              autoComplete="email"
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Mot de passe</label>
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            style={{ ...styles.button, ...(loading ? styles.buttonDisabled : {}) }}
            disabled={loading}
          >
            {loading && <span style={styles.spinner} />}
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
        <div style={styles.demo}>
          <div style={styles.demoTitle}>Comptes de démonstration :</div>
          <div>
            <span
              style={{ color: '#86efac', cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => fillDemo('admin')}
            >Admin</span>
            {' '}· admin@greenops.local / Admin@GreenOps2024
          </div>
          <div style={{ marginTop: 4 }}>
            <span
              style={{ color: '#86efac', cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => fillDemo('user')}
            >Demo</span>
            {' '}· demo@greenops.local / Demo@GreenOps2024
          </div>
        </div>
      </div>
    </div>
  );
}
