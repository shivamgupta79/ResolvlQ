import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api.js';

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm]       = useState({ email: '', password: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', form);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      const role = data.user.role;
      navigate(role === 'technician' ? '/my-work' : '/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-split">
      {/* ── Left panel ── */}
      <div className="auth-left">
        <div className="auth-left-inner">
          <div className="auth-brand">
            <span className="auth-brand-icon">🔧</span>
            <span className="auth-brand-name">ResolvIQ</span>
          </div>
          <h1 className="auth-headline">
            Smart maintenance,<br />zero hassle.
          </h1>
          <p className="auth-sub">
            AI-powered complaint management for modern apartment communities.
          </p>
          <div className="auth-features">
            {[
              { icon: '🤖', text: 'AI classifies & prioritises issues instantly' },
              { icon: '👷', text: 'Smart engineer assignment with slot tracking' },
              { icon: '📱', text: 'WhatsApp & email notifications built-in' },
              { icon: '📊', text: 'Real-time dashboards for every role' },
            ].map((f) => (
              <div key={f.text} className="auth-feature-item">
                <span className="auth-feature-icon">{f.icon}</span>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="auth-right">
        <div className="auth-form-box">
          <div style={{ marginBottom: 28 }}>
            <h2 className="auth-form-title">Welcome back</h2>
            <p className="auth-form-sub">Sign in to your ResolvIQ account</p>
          </div>

          <form onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
            {/* Email */}
            <div className="auth-field">
              <label className="auth-label">Email address</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">✉️</span>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={set('email')}
                  required
                  autoComplete="email"
                  className="auth-input"
                />
              </div>
            </div>

            {/* Password */}
            <div className="auth-field">
              <label className="auth-label">Password</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">🔒</span>
                <input
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Your password"
                  value={form.password}
                  onChange={set('password')}
                  required
                  autoComplete="current-password"
                  className="auth-input"
                />
                <button
                  type="button"
                  className="auth-pwd-toggle"
                  onClick={() => setShowPwd((v) => !v)}
                  tabIndex={-1}
                >
                  {showPwd ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {error && (
              <div className="auth-error">
                <span>⚠️</span> {error}
              </div>
            )}

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading}
            >
              {loading ? (
                <span className="auth-spinner" />
              ) : (
                'Sign In →'
              )}
            </button>
          </form>

          <p className="auth-switch">
            Don't have an account?{' '}
            <Link to="/register" className="auth-link">Create one free</Link>
          </p>

          {/* Role hint */}
          <div className="auth-role-hint">
            <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Sign in as
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { role: 'Resident', icon: '🏠', color: '#dbeafe', text: '#1d4ed8' },
                { role: 'Technician', icon: '🔧', color: '#dcfce7', text: '#166534' },
                { role: 'Admin', icon: '⚙️', color: '#ede9fe', text: '#6d28d9' },
              ].map((r) => (
                <span
                  key={r.role}
                  style={{ background: r.color, color: r.text, padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}
                >
                  {r.icon} {r.role}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
