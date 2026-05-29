import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api.js';

const DANGER_ZONE_STYLE = {
  marginTop: 32,
  border: '1.5px solid #fca5a5',
  borderRadius: 14,
  padding: '20px 20px 16px',
  background: '#fff5f5'
};

const DELETE_BTN_STYLE = {
  marginTop: 12,
  background: '#ef4444',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '10px 22px',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
  width: '100%'
};

export default function Profile() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    name: '', phone: '', whatsapp: '', apartmentNo: ''
  });
  const [avatarUrl, setAvatarUrl]   = useState('');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [uploading, setUploading]   = useState(false);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [msg, setMsg]               = useState('');
  const [error, setError]           = useState('');
  const [deleting, setDeleting]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    api.get('/auth/profile')
      .then(({ data }) => {
        setForm({
          name:        data.name        || '',
          phone:       data.phone       || '',
          whatsapp:    data.whatsapp    || '',
          apartmentNo: data.apartmentNo || ''
        });
        setAvatarUrl(data.avatarUrl || '');
      })
      .catch(() => setError('Failed to load profile'))
      .finally(() => setLoading(false));
  }, []);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Show local preview immediately
    setAvatarPreview(URL.createObjectURL(file));
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { data } = await api.post('/upload/image', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setAvatarUrl(data.url);
    } catch (err) {
      setError(err.response?.data?.message || 'Photo upload failed');
      setAvatarPreview('');
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = () => {
    setAvatarUrl('');
    setAvatarPreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const save = async (e) => {
    e.preventDefault();
    setMsg(''); setError('');
    setSaving(true);
    try {
      const { data } = await api.patch('/auth/profile', { ...form, avatarUrl });
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...stored, ...data }));
      setMsg('✅ Profile saved successfully!');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setError('');
    try {
      await api.delete('/auth/account');
      localStorage.clear();
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete account');
      setDeleting(false);
      setShowConfirm(false);
    }
  };

  if (loading) return <p className="muted">Loading profile…</p>;

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const displayAvatar = avatarPreview || avatarUrl;
  const initials = (form.name || user.name || '?')[0].toUpperCase();

  return (
    <div className="form-card card">
      {/* ── Avatar section ── */}
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        {/* Avatar circle — click to upload */}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          {displayAvatar ? (
            <img
              src={displayAvatar}
              alt="Profile"
              style={{
                width: 88,
                height: 88,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '3px solid #e2e8f0',
                display: 'block'
              }}
            />
          ) : (
            <div
              className="profile-avatar"
              style={{ width: 88, height: 88, fontSize: 32, lineHeight: '88px' }}
            >
              {initials}
            </div>
          )}

          {/* Camera overlay button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="Change profile photo"
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: uploading ? '#94a3b8' : '#2563eb',
              color: '#fff',
              border: '2px solid #fff',
              cursor: uploading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              boxShadow: '0 1px 4px rgba(0,0,0,.2)'
            }}
          >
            {uploading ? '⏳' : '📷'}
          </button>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleAvatarChange}
        />

        {/* Upload hint / remove button */}
        <div style={{ marginTop: 8 }}>
          {uploading ? (
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>Uploading…</p>
          ) : displayAvatar ? (
            <button
              type="button"
              onClick={removeAvatar}
              style={{
                background: 'none',
                border: 'none',
                color: '#dc2626',
                fontSize: 12,
                cursor: 'pointer',
                padding: 0
              }}
            >
              ✕ Remove photo
            </button>
          ) : (
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              Click the camera icon to upload a photo
            </p>
          )}
        </div>

        <h2 style={{ margin: '10px 0 4px' }}>{form.name || user.name}</h2>
        <p className="muted" style={{ margin: 0 }}>{user.email}</p>
        <span
          className={`pill ${user.role === 'admin' ? 'pill-online' : 'low'}`}
          style={{ marginTop: 8, display: 'inline-block' }}
        >
          {user.role}
        </span>
      </div>

      {/* ── Form ── */}
      <form onSubmit={save}>
        <div>
          <label className="field-label">Full Name</label>
          <input
            placeholder="Your full name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>

        <div>
          <label className="field-label">Apartment Number</label>
          <input
            placeholder="e.g. A-204"
            value={form.apartmentNo}
            onChange={(e) => setForm({ ...form, apartmentNo: e.target.value })}
          />
        </div>

        <div>
          <label className="field-label">Phone Number</label>
          <input
            placeholder="+91 98765 43210"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            Used for contact purposes
          </p>
        </div>

        <div>
          <label className="field-label">WhatsApp Number</label>
          <input
            placeholder="+91 98765 43210 (with country code)"
            value={form.whatsapp}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
          />
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            Used to send complaint notifications via WhatsApp.
            Must include country code (e.g. +91…).
            You must first join the sandbox by sending{' '}
            <b>"join &lt;word&gt;"</b> to <b>+1 415 523 8886</b> on WhatsApp.
          </p>
        </div>

        {/* WhatsApp setup guide */}
        <div className="whatsapp-guide">
          <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 13 }}>📱 WhatsApp Setup (one-time)</p>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
            <li>Open WhatsApp on your phone</li>
            <li>Send <code>join &lt;sandbox-word&gt;</code> to <b>+1 415 523 8886</b></li>
            <li>Wait for confirmation reply</li>
            <li>Enter your WhatsApp number above (with country code)</li>
          </ol>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b' }}>
            The sandbox word is shown in your Twilio console under Messaging → Try it out → Send a WhatsApp message.
          </p>
        </div>

        {error && <p className="error">{error}</p>}
        {msg   && <p className="success">{msg}</p>}

        <button className="primary" disabled={saving || uploading}>
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </form>

      {/* ── Danger Zone ── */}
      <div style={DANGER_ZONE_STYLE}>
        <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 14, color: '#b91c1c' }}>
          ⚠️ Danger Zone
        </p>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>

        {!showConfirm ? (
          <button style={DELETE_BTN_STYLE} onClick={() => setShowConfirm(true)}>
            Delete My Account
          </button>
        ) : (
          <div style={{ marginTop: 12, background: '#fee2e2', borderRadius: 10, padding: '14px 16px' }}>
            <p style={{ margin: '0 0 12px', fontWeight: 600, fontSize: 13, color: '#7f1d1d' }}>
              Are you sure? This will permanently delete your account, profile, and all your data.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                style={{ ...DELETE_BTN_STYLE, marginTop: 0, width: 'auto', padding: '9px 20px' }}
                onClick={deleteAccount}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Yes, Delete My Account'}
              </button>
              <button
                style={{ marginTop: 0, background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 10, padding: '9px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
                onClick={() => setShowConfirm(false)}
                disabled={deleting}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
