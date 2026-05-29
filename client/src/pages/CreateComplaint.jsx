import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api.js';

export default function CreateComplaint() {
  const user     = JSON.parse(localStorage.getItem('user') || '{}');
  const navigate = useNavigate();

  const [form, setForm] = useState({
    residentName:  user.name  || '',
    residentEmail: user.email || '',
    apartmentNo:   user.apartmentNo || '',
    description:   '',
    preferredDate: '',
    preferredTime: '',
    imageUrl:      ''
  });
  const [aiResult, setAiResult]     = useState(null);
  const [loading, setLoading]       = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [error, setError]           = useState('');
  const [imagePreview, setImagePreview] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const classify = async () => {
    if (!form.description.trim()) return;
    setClassifying(true);
    try {
      const { data } = await api.post('/ai/classify-issue', { description: form.description });
      setAiResult(data);
    } catch {
      setError('AI classification failed');
    } finally {
      setClassifying(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { data } = await api.post('/upload/image', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setForm((f) => ({ ...f, imageUrl: data.url }));
      setImagePreview(URL.createObjectURL(file));
    } catch (err) {
      setError(err.response?.data?.message || 'Image upload failed');
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = { ...form, ...(aiResult || {}) };
      const { data } = await api.post('/complaints', payload);
      // Non-blocking email + calendar
      api.post(`/complaints/${data._id}/send-email`).catch(() => {});
      api.post(`/complaints/${data._id}/schedule`).catch(() => {});
      navigate(`/complaints/${data._id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create complaint');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card form-card">
      <h2 style={{ margin: '0 0 6px' }}>New Maintenance Complaint</h2>
      <p className="muted" style={{ margin: '0 0 24px' }}>
        Describe your issue and we'll classify it automatically.
      </p>

      <form onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
        {/* Resident info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="field-label">Your Name</label>
            <input placeholder="Full name" value={form.residentName} onChange={set('residentName')} required />
          </div>
          <div>
            <label className="field-label">Apartment No</label>
            <input placeholder="e.g. A-204" value={form.apartmentNo} onChange={set('apartmentNo')} required />
          </div>
        </div>

        <div>
          <label className="field-label">Email</label>
          <input type="email" placeholder="your@email.com" value={form.residentEmail} onChange={set('residentEmail')} required />
        </div>

        {/* Description + AI */}
        <div>
          <label className="field-label">Describe the Issue</label>
          <textarea
            placeholder="e.g. Water is leaking from the bathroom tap and flooding the floor…"
            value={form.description}
            onChange={set('description')}
            required
            style={{ minHeight: 100 }}
          />
        </div>

        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={classify}
            disabled={classifying || !form.description.trim()}
            style={{ background: '#ede9fe', color: '#6d28d9', border: 'none', borderRadius: 12, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
          >
            {classifying ? '🤖 Classifying…' : '🤖 AI Classify Issue'}
          </button>
          {aiResult && (
            <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 12, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#166534' }}>
              ✅ {aiResult.issueType} · {aiResult.priority} priority
            </div>
          )}
        </div>

        {/* Date + Time */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="field-label">Preferred Date</label>
            <input type="date" value={form.preferredDate} onChange={set('preferredDate')} required />
          </div>
          <div>
            <label className="field-label">Preferred Time</label>
            <input type="time" value={form.preferredTime} onChange={set('preferredTime')} required />
          </div>
        </div>

        {/* Image upload */}
        <div>
          <label className="field-label">Attach Photo (optional)</label>
          <div className="image-upload-area">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              id="img-upload"
              style={{ display: 'none' }}
            />
            <label htmlFor="img-upload" className="image-upload-label">
              {uploading ? '⏳ Uploading…' : '📷 Choose photo (max 5MB)'}
            </label>
            {imagePreview && (
              <div style={{ marginTop: 10 }}>
                <img
                  src={imagePreview}
                  alt="Preview"
                  style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 12, objectFit: 'cover', border: '1px solid #e2e8f0' }}
                />
                <button
                  type="button"
                  onClick={() => { setImagePreview(''); setForm((f) => ({ ...f, imageUrl: '' })); }}
                  style={{ display: 'block', marginTop: 6, fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  ✕ Remove photo
                </button>
              </div>
            )}
          </div>
        </div>

        {error && <div className="auth-error"><span>⚠️</span> {error}</div>}

        <button className="auth-submit-btn" disabled={loading}>
          {loading ? <span className="auth-spinner" /> : '🚀 Submit Complaint'}
        </button>
      </form>
    </div>
  );
}
