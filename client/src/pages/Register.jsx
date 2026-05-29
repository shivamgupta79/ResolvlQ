import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api.js';

const ROLES = [
  {
    value: 'resident',
    label: 'Resident',
    icon: '🏠',
    desc: 'Submit and track maintenance complaints',
    color: '#dbeafe',
    border: '#93c5fd',
    text: '#1d4ed8',
  },
  {
    value: 'technician',
    label: 'Technician',
    icon: '🔧',
    desc: 'Receive and manage assigned work orders',
    color: '#dcfce7',
    border: '#86efac',
    text: '#166534',
  },
  {
    value: 'admin',
    label: 'Admin',
    icon: '⚙️',
    desc: 'Manage engineers, assign complaints, oversee all',
    color: '#ede9fe',
    border: '#c4b5fd',
    text: '#6d28d9',
  },
];

const STEPS = {
  resident:   ['account', 'details', 'done'],
  technician: ['account', 'details', 'schedule', 'done'],
  admin:      ['account', 'done'],
};

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirmPassword: '',
    apartmentNo: '', phone: '',
    role: 'resident',
    skillType: '', joiningTime: '',
  });
  const [step, setStep]       = useState('role');   // 'role' | 'account' | 'details' | 'schedule' | 'done'
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setError(''); };

  const selectRole = (role) => {
    setForm((f) => ({ ...f, role }));
    setStep('account');
  };

  const nextStep = () => {
    setError('');
    const steps = STEPS[form.role];
    const idx   = steps.indexOf(step);
    if (idx < steps.length - 1) setStep(steps[idx + 1]);
  };

  const prevStep = () => {
    setError('');
    if (step === 'account') { setStep('role'); return; }
    const steps = STEPS[form.role];
    const idx   = steps.indexOf(step);
    if (idx > 0) setStep(steps[idx - 1]);
  };

  const validateAccount = () => {
    if (!form.name.trim())  return 'Name is required';
    if (!form.email.trim()) return 'Email is required';
    if (form.password.length < 6) return 'Password must be at least 6 characters';
    if (form.password !== form.confirmPassword) return 'Passwords do not match';
    return null;
  };

  const validateDetails = () => {
    if (form.role === 'resident' && !form.apartmentNo.trim()) return 'Apartment number is required';
    if (!form.phone.trim()) return 'Phone number is required';
    return null;
  };

  const validateSchedule = () => {
    if (!form.skillType.trim()) return 'Skill type is required';
    if (!form.joiningTime)      return 'Joining time is required';
    return null;
  };

  const handleNext = () => {
    let err = null;
    if (step === 'account')  err = validateAccount();
    if (step === 'details')  err = validateDetails();
    if (step === 'schedule') err = validateSchedule();
    if (err) { setError(err); return; }
    nextStep();
  };

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      const payload = { ...form };
      delete payload.confirmPassword;
      const { data } = await api.post('/auth/register', payload);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      const role = data.user.role;
      navigate(role === 'technician' ? '/my-work' : '/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const roleObj = ROLES.find((r) => r.value === form.role);

  // ── Step progress indicator ──────────────────────────────────────────────
  const steps = step === 'role' ? [] : STEPS[form.role].filter((s) => s !== 'done');
  const stepIdx = steps.indexOf(step);

  return (
    <div className="auth-split">
      {/* ── Left panel ── */}
      <div className="auth-left">
        <div className="auth-left-inner">
          <div className="auth-brand">
            <span className="auth-brand-icon">🔧</span>
            <span className="auth-brand-name">FixFlow AI</span>
          </div>
          <h1 className="auth-headline">
            Join your<br />community hub.
          </h1>
          <p className="auth-sub">
            Create your account and start managing maintenance requests the smart way.
          </p>

          {/* Role preview */}
          {step !== 'role' && roleObj && (
            <div
              className="auth-role-preview"
              style={{ background: roleObj.color, border: `1px solid ${roleObj.border}` }}
            >
              <span style={{ fontSize: 28 }}>{roleObj.icon}</span>
              <div>
                <p style={{ margin: 0, fontWeight: 800, color: roleObj.text, fontSize: 16 }}>
                  {roleObj.label}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: '#475569' }}>{roleObj.desc}</p>
              </div>
            </div>
          )}

          {/* Step progress */}
          {steps.length > 0 && (
            <div className="auth-steps">
              {steps.map((s, i) => (
                <div key={s} className="auth-step-item">
                  <div className={`auth-step-dot ${i <= stepIdx ? 'active' : ''}`}>
                    {i < stepIdx ? '✓' : i + 1}
                  </div>
                  <span className={`auth-step-label ${i === stepIdx ? 'current' : ''}`}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </span>
                  {i < steps.length - 1 && <div className={`auth-step-line ${i < stepIdx ? 'done' : ''}`} />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="auth-right">
        <div className="auth-form-box">

          {/* ── STEP: Role selection ── */}
          {step === 'role' && (
            <>
              <div style={{ marginBottom: 28 }}>
                <h2 className="auth-form-title">Create your account</h2>
                <p className="auth-form-sub">Choose how you'll use FixFlow</p>
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    className="auth-role-card"
                    style={{ '--role-color': r.color, '--role-border': r.border, '--role-text': r.text }}
                    onClick={() => selectRole(r.value)}
                  >
                    <span className="auth-role-card-icon">{r.icon}</span>
                    <div style={{ textAlign: 'left' }}>
                      <p style={{ margin: 0, fontWeight: 800, fontSize: 15 }}>{r.label}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b' }}>{r.desc}</p>
                    </div>
                    <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: 18 }}>→</span>
                  </button>
                ))}
              </div>
              <p className="auth-switch" style={{ marginTop: 24 }}>
                Already have an account? <Link to="/login" className="auth-link">Sign in</Link>
              </p>
            </>
          )}

          {/* ── STEP: Account ── */}
          {step === 'account' && (
            <>
              <div style={{ marginBottom: 24 }}>
                <button type="button" className="auth-back-btn" onClick={prevStep}>← Back</button>
                <h2 className="auth-form-title" style={{ marginTop: 12 }}>Account details</h2>
                <p className="auth-form-sub">Set up your login credentials</p>
              </div>
              <div style={{ display: 'grid', gap: 14 }}>
                <div className="auth-field">
                  <label className="auth-label">Full Name</label>
                  <div className="auth-input-wrap">
                    <span className="auth-input-icon">👤</span>
                    <input className="auth-input" placeholder="John Smith" value={form.name} onChange={set('name')} required />
                  </div>
                </div>
                <div className="auth-field">
                  <label className="auth-label">Email Address</label>
                  <div className="auth-input-wrap">
                    <span className="auth-input-icon">✉️</span>
                    <input className="auth-input" type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} required />
                  </div>
                </div>
                <div className="auth-field">
                  <label className="auth-label">Password</label>
                  <div className="auth-input-wrap">
                    <span className="auth-input-icon">🔒</span>
                    <input className="auth-input" type={showPwd ? 'text' : 'password'} placeholder="Min. 6 characters" value={form.password} onChange={set('password')} required />
                    <button type="button" className="auth-pwd-toggle" onClick={() => setShowPwd((v) => !v)} tabIndex={-1}>
                      {showPwd ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
                <div className="auth-field">
                  <label className="auth-label">Confirm Password</label>
                  <div className="auth-input-wrap">
                    <span className="auth-input-icon">🔒</span>
                    <input className="auth-input" type={showPwd ? 'text' : 'password'} placeholder="Repeat password" value={form.confirmPassword} onChange={set('confirmPassword')} required />
                  </div>
                </div>
                {error && <div className="auth-error"><span>⚠️</span> {error}</div>}
                <button type="button" className="auth-submit-btn" onClick={handleNext}>
                  Continue →
                </button>
              </div>
            </>
          )}

          {/* ── STEP: Details (resident / technician) ── */}
          {step === 'details' && (
            <>
              <div style={{ marginBottom: 24 }}>
                <button type="button" className="auth-back-btn" onClick={prevStep}>← Back</button>
                <h2 className="auth-form-title" style={{ marginTop: 12 }}>Your details</h2>
                <p className="auth-form-sub">Help us personalise your experience</p>
              </div>
              <div style={{ display: 'grid', gap: 14 }}>
                {form.role === 'resident' && (
                  <div className="auth-field">
                    <label className="auth-label">Apartment Number</label>
                    <div className="auth-input-wrap">
                      <span className="auth-input-icon">🏠</span>
                      <input className="auth-input" placeholder="e.g. A-204" value={form.apartmentNo} onChange={set('apartmentNo')} required />
                    </div>
                  </div>
                )}
                <div className="auth-field">
                  <label className="auth-label">Phone Number</label>
                  <div className="auth-input-wrap">
                    <span className="auth-input-icon">📞</span>
                    <input className="auth-input" placeholder="+91 98765 43210" value={form.phone} onChange={set('phone')} required />
                  </div>
                </div>
                {error && <div className="auth-error"><span>⚠️</span> {error}</div>}
                <button type="button" className="auth-submit-btn" onClick={handleNext}>
                  Continue →
                </button>
              </div>
            </>
          )}

          {/* ── STEP: Schedule (technician only) ── */}
          {step === 'schedule' && (
            <>
              <div style={{ marginBottom: 24 }}>
                <button type="button" className="auth-back-btn" onClick={prevStep}>← Back</button>
                <h2 className="auth-form-title" style={{ marginTop: 12 }}>Work schedule</h2>
                <p className="auth-form-sub">Set your skill and daily start time</p>
              </div>
              <div style={{ display: 'grid', gap: 14 }}>
                <div className="auth-field">
                  <label className="auth-label">Skill Type</label>
                  <div className="auth-input-wrap">
                    <span className="auth-input-icon">🔧</span>
                    <input className="auth-input" placeholder="e.g. Plumbing, Electrical, Lift" value={form.skillType} onChange={set('skillType')} required />
                  </div>
                </div>
                <div className="auth-field">
                  <label className="auth-label">Daily Start Time (before 18:00)</label>
                  <div className="auth-input-wrap">
                    <span className="auth-input-icon">🕐</span>
                    <input className="auth-input" type="time" max="17:59" value={form.joiningTime} onChange={set('joiningTime')} required />
                  </div>
                  <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                    Your daily slot capacity is computed automatically (1 slot/hour until 18:00)
                  </p>
                </div>

                {/* Preview */}
                {form.joiningTime && (
                  <div className="schedule-preview">
                    <span>🕐 {form.joiningTime}</span>
                    <span style={{ color: '#94a3b8' }}>→</span>
                    <span>🕕 18:00</span>
                    <span style={{ color: '#94a3b8' }}>·</span>
                    <span>
                      <b>{Math.floor((18 * 60 - (parseInt(form.joiningTime.split(':')[0]) * 60 + parseInt(form.joiningTime.split(':')[1]))) / 60)}</b> slots/day
                    </span>
                  </div>
                )}

                {error && <div className="auth-error"><span>⚠️</span> {error}</div>}
                <button type="button" className="auth-submit-btn" onClick={handleNext}>
                  Continue →
                </button>
              </div>
            </>
          )}

          {/* ── STEP: Review & Submit ── */}
          {step === 'done' && (
            <>
              <div style={{ marginBottom: 24 }}>
                <button type="button" className="auth-back-btn" onClick={prevStep}>← Back</button>
                <h2 className="auth-form-title" style={{ marginTop: 12 }}>Almost there!</h2>
                <p className="auth-form-sub">Review your details and create your account</p>
              </div>

              {/* Summary card */}
              <div className="auth-summary">
                <div className="auth-summary-row"><span>Name</span><b>{form.name}</b></div>
                <div className="auth-summary-row"><span>Email</span><b>{form.email}</b></div>
                <div className="auth-summary-row">
                  <span>Role</span>
                  <b style={{ color: roleObj?.text }}>{roleObj?.icon} {roleObj?.label}</b>
                </div>
                {form.apartmentNo && <div className="auth-summary-row"><span>Apartment</span><b>{form.apartmentNo}</b></div>}
                {form.phone       && <div className="auth-summary-row"><span>Phone</span><b>{form.phone}</b></div>}
                {form.skillType   && <div className="auth-summary-row"><span>Skill</span><b>{form.skillType}</b></div>}
                {form.joiningTime && <div className="auth-summary-row"><span>Start Time</span><b>{form.joiningTime}</b></div>}
              </div>

              {error && <div className="auth-error" style={{ marginBottom: 12 }}><span>⚠️</span> {error}</div>}

              <button
                type="button"
                className="auth-submit-btn"
                onClick={submit}
                disabled={loading}
                style={{ marginTop: 8 }}
              >
                {loading ? <span className="auth-spinner" /> : '🚀 Create Account'}
              </button>
            </>
          )}

          {step !== 'role' && step !== 'done' && (
            <p className="auth-switch" style={{ marginTop: 20 }}>
              Already have an account? <Link to="/login" className="auth-link">Sign in</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
