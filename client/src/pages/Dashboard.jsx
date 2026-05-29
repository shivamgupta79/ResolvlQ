import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import api, { scoreTechnicians, getEscalationRiskSingle } from '../services/api.js';
import { useSocket } from '../hooks/useSocket.js';

// ─── Admin Dashboard ──────────────────────────────────────────────────────────

const STATUS_META = {
  Pending:       { icon: '⏳', color: '#d97706', bg: '#fef3c7', border: '#fcd34d' },
  Assigned:      { icon: '👷', color: '#2563eb', bg: '#dbeafe', border: '#93c5fd' },
  'In Progress': { icon: '🔧', color: '#7c3aed', bg: '#ede9fe', border: '#c4b5fd' },
  Scheduled:     { icon: '📅', color: '#0891b2', bg: '#e0f2fe', border: '#7dd3fc' },
  Completed:     { icon: '✅', color: '#16a34a', bg: '#dcfce7', border: '#86efac' },
  Cancelled:     { icon: '🚫', color: '#dc2626', bg: '#fee2e2', border: '#fca5a5' },
};

const PRIORITY_META = {
  Low:    { color: '#166534', bg: '#dcfce7' },
  Medium: { color: '#92400e', bg: '#fef3c7' },
  High:   { color: '#b91c1c', bg: '#fee2e2' },
  Urgent: { color: '#7f1d1d', bg: '#fecaca' },
};

function IconBtn({ title, onClick, disabled, children, variant = 'default' }) {
  const styles = {
    default:  { background: '#f1f5f9', color: '#475569' },
    primary:  { background: '#2563eb', color: 'white' },
    success:  { background: '#dcfce7', color: '#166534' },
    danger:   { background: '#fee2e2', color: '#b91c1c' },
    warning:  { background: '#fef3c7', color: '#92400e' },
  };
  const s = styles[variant] || styles.default;
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...s,
        border: 'none',
        borderRadius: 10,
        padding: '7px 10px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontSize: 15,
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        transition: 'opacity .15s, transform .1s',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.opacity = '.85'; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = disabled ? '.5' : '1'; }}
    >
      {children}
    </button>
  );
}

function AdminDashboard() {
  const [complaints, setComplaints] = useState([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [pages, setPages]           = useState(1);
  const [error, setError]           = useState('');
  const [engineers, setEngineers]   = useState([]);
  const [assigningId, setAssigningId]         = useState(null);
  const [assignError, setAssignError]         = useState('');
  const [selectedEngineerId, setSelectedEngineerId] = useState('');
  const [assignReason, setAssignReason]       = useState('');
  const [filter, setFilter]         = useState('All');
  const [search, setSearch]         = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const [selected, setSelected]     = useState(new Set()); // bulk select
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkReason, setBulkReason] = useState('');
  const [bulking, setBulking]       = useState(false);

  // ── AI Score assignment state ──────────────────────────────────────────────
  // { [complaintId]: { loading, ranked, reason, error } }
  const [aiScores, setAiScores]     = useState({});

  // ── Escalation risk scores ─────────────────────────────────────────────────
  // { [complaintId]: escalationRiskScore }
  const [riskScores, setRiskScores] = useState({});

  // ── Follow-up notification banners ────────────────────────────────────────
  // Array of { complaintId, residentName, sentimentLabel }
  const [followUpBanners, setFollowUpBanners] = useState([]);

  // ── Anomaly alert banners ─────────────────────────────────────────────────
  // Array of anomaly alert objects
  const [anomalyBanners, setAnomalyBanners] = useState([]);

  // ── Duplicate group filter ────────────────────────────────────────────────
  const [duplicateGroupFilter, setDuplicateGroupFilter] = useState(null);

  const load = async (p = 1, f = filter) => {
    try {
      const params = new URLSearchParams({ page: p, limit: 50 });
      if (f !== 'All') params.set('status', f);
      const { data } = await api.get(`/complaints?${params}`);
      const list = data?.complaints ?? (Array.isArray(data) ? data : []);
      setComplaints(list);
      setTotal(data?.total ?? list.length);
      setPages(data?.pages ?? 1);
      // Lazily fetch escalation risk scores for loaded complaints
      fetchRiskScores(list);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load complaints');
    }
  };

  // Fetch escalation risk scores lazily for a list of complaints
  const fetchRiskScores = async (list) => {
    const openComplaints = list.filter(
      (c) => c.status !== 'Completed' && c.status !== 'Cancelled'
    );
    const results = await Promise.allSettled(
      openComplaints.map((c) =>
        getEscalationRiskSingle(c._id).then((res) => ({
          id: c._id,
          score: res.data?.escalationRiskScore ?? null,
        }))
      )
    );
    const scores = {};
    results.forEach((r) => {
      if (r.status === 'fulfilled' && r.value.score !== null) {
        scores[r.value.id] = r.value.score;
      }
    });
    setRiskScores((prev) => ({ ...prev, ...scores }));
  };

  useEffect(() => { load(1, filter); setPage(1); }, [filter]);
  useEffect(() => { load(page, filter); }, [page]);

  // Real-time updates via Socket.io
  useSocket('complaint:updated', (update) => {
    setComplaints((prev) =>
      prev.map((c) => c._id === update._id ? { ...c, ...update } : c)
    );
  });

  // Follow-up notification: show dismissible banner when negative feedback detected
  useSocket('complaint:followup_required', (payload) => {
    setFollowUpBanners((prev) => {
      // Avoid duplicate banners for the same complaint
      if (prev.some((b) => b.complaintId === payload.complaintId)) return prev;
      return [...prev, payload];
    });
  });

  // Anomaly alert: show sticky banner at top of dashboard
  useSocket('anomaly:detected', (alert) => {
    setAnomalyBanners((prev) => {
      if (prev.some((b) => b._id === alert._id)) return prev;
      return [...prev, alert];
    });
  });

  const updateStatus = async (id, status, reason = '') => {
    setUpdatingId(id + status);
    try {
      await api.patch(`/complaints/${id}/status`, { status, reason });
      load(page);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  };

  const startAssign = async (complaintId) => {
    setAssigningId(complaintId);
    setAssignError('');
    setSelectedEngineerId('');
    setAssignReason('');
    // Load AI-ranked technicians for this complaint
    setAiScores((prev) => ({ ...prev, [complaintId]: { loading: true, ranked: [], reason: null, error: null } }));
    try {
      const { data } = await scoreTechnicians(complaintId);
      setAiScores((prev) => ({
        ...prev,
        [complaintId]: {
          loading: false,
          ranked: data.ranked ?? [],
          reason: data.reason ?? null,
          error: null,
        },
      }));
      // Also load the full engineers list for the select (fallback / confirm)
      const { data: engData } = await api.get('/engineers');
      setEngineers(engData);
    } catch (err) {
      setAiScores((prev) => ({
        ...prev,
        [complaintId]: { loading: false, ranked: [], reason: null, error: err.response?.data?.message || 'Failed to load AI scores' },
      }));
      // Fallback: still load engineers
      try {
        const { data: engData } = await api.get('/engineers');
        setEngineers(engData);
      } catch {
        setAssignError('Failed to load engineers');
      }
    }
  };

  const confirmAssign = async (complaintId) => {
    setAssignError('');
    try {
      await api.post('/engineers/assign', { complaintId, engineerId: selectedEngineerId, reason: assignReason });
      await load(page);
      setAssigningId(null);
      setSelectedEngineerId('');
      setAssignReason('');
    } catch (err) {
      setAssignError(err.response?.data?.message || 'Assignment failed');
    }
  };

  const cancelAssign = () => {
    setAssigningId(null);
    setSelectedEngineerId('');
    setAssignReason('');
    setAssignError('');
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === visible.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visible.map((c) => c._id)));
    }
  };

  const doBulkUpdate = async () => {
    if (!bulkStatus || selected.size === 0) return;
    setBulking(true);
    try {
      await api.post('/complaints/bulk-status', { ids: [...selected], status: bulkStatus, reason: bulkReason || 'Bulk update' });
      setSelected(new Set());
      setBulkStatus('');
      setBulkReason('');
      load(page);
    } catch (err) {
      setError(err.response?.data?.message || 'Bulk update failed');
    } finally {
      setBulking(false);
    }
  };

  const statuses = ['All', 'Pending', 'Assigned', 'In Progress', 'Scheduled', 'Completed', 'Cancelled'];

  const counts = statuses.slice(1).reduce((acc, s) => {
    acc[s] = complaints.filter((c) => c.status === s).length;
    return acc;
  }, {});

  // Apply duplicate group filter first, then search
  const baseList = duplicateGroupFilter
    ? complaints.filter((c) => c.duplicateGroupId === duplicateGroupFilter)
    : complaints;

  const visible = search.trim()
    ? baseList.filter((c) =>
        [c.issueType, c.residentName, c.apartmentNo, c.description]
          .join(' ').toLowerCase().includes(search.toLowerCase())
      )
    : baseList;

  return (
    <section>
      {/* ── Anomaly alert banners (sticky, dismiss on click) ── */}
      {anomalyBanners.map((alert) => (
        <div
          key={alert._id}
          onClick={() => setAnomalyBanners((prev) => prev.filter((b) => b._id !== alert._id))}
          style={{
            background: '#fef2f2',
            border: '1.5px solid #fca5a5',
            borderRadius: 10,
            padding: '10px 16px',
            marginBottom: 10,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 14,
            fontWeight: 600,
            color: '#b91c1c',
          }}
          title="Click to dismiss"
        >
          🚨 Anomaly detected: <strong>{alert.issueType}</strong> spike in Block{' '}
          <strong>{alert.apartmentBlock}</strong> (severity: {alert.severity}).
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>
            Click to dismiss
          </span>
        </div>
      ))}

      {/* ── Follow-up notification banners ── */}
      {followUpBanners.map((banner) => (
        <div
          key={banner.complaintId}
          style={{
            background: '#fffbeb',
            border: '1.5px solid #fcd34d',
            borderRadius: 10,
            padding: '10px 16px',
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 14,
            fontWeight: 600,
            color: '#92400e',
          }}
        >
          ⚠️ Negative feedback from <strong>{banner.residentName}</strong> — follow-up required.{' '}
          <Link
            to={`/complaints/${banner.complaintId}`}
            style={{ color: '#2563eb', fontWeight: 700, marginLeft: 4 }}
          >
            View complaint →
          </Link>
          <button
            onClick={() => setFollowUpBanners((prev) => prev.filter((b) => b.complaintId !== banner.complaintId))}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 16,
              color: '#92400e',
              padding: '0 4px',
            }}
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}

      {/* ── Header ── */}
      <div className="adm-header">
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Admin Dashboard</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {complaints.length} total · {counts.Pending} pending · {counts.Assigned} assigned
          </p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Link className="adm-header-btn adm-header-btn-primary" to="/engineers">
            👷 Engineers
          </Link>
          <button className="adm-header-btn" onClick={() => load(page)} title="Refresh">
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && <div className="auth-error" style={{ marginBottom: 16 }}><span>⚠️</span> {error}</div>}

      {/* ── Clickable stat chips ── */}
      <div className="adm-stats">
        {/* All chip */}
        <button
          className={`adm-stat-chip ${filter === 'All' ? 'adm-stat-active' : ''}`}
          onClick={() => setFilter('All')}
          style={{ '--chip-color': '#2563eb', '--chip-bg': '#eff6ff', '--chip-border': '#bfdbfe' }}
        >
          <span className="adm-stat-icon">📋</span>
          <span className="adm-stat-num">{complaints.length}</span>
          <span className="adm-stat-lbl">All</span>
        </button>

        {statuses.slice(1).map((s) => {
          const m = STATUS_META[s];
          return (
            <button
              key={s}
              className={`adm-stat-chip ${filter === s ? 'adm-stat-active' : ''}`}
              onClick={() => setFilter(s)}
              style={{ '--chip-color': m.color, '--chip-bg': m.bg, '--chip-border': m.border }}
            >
              <span className="adm-stat-icon">{m.icon}</span>
              <span className="adm-stat-num" style={{ color: m.color }}>{counts[s]}</span>
              <span className="adm-stat-lbl">{s}</span>
            </button>
          );
        })}
      </div>

      {/* ── Search ── */}
      <div className="adm-search-wrap">
        <span className="adm-search-icon">🔍</span>
        <input
          className="adm-search"
          placeholder="Search by issue, resident, apartment…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button className="adm-search-clear" onClick={() => setSearch('')}>✕</button>
        )}
      </div>

      {/* ── Duplicate group filter indicator ── */}
      {duplicateGroupFilter && (
        <div
          style={{
            background: '#f0f9ff',
            border: '1.5px solid #7dd3fc',
            borderRadius: 10,
            padding: '8px 14px',
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            color: '#0369a1',
            fontWeight: 600,
          }}
        >
          🔗 Showing complaints in duplicate group
          <button
            onClick={() => setDuplicateGroupFilter(null)}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
              color: '#0369a1',
              padding: '0 4px',
            }}
            title="Clear group filter"
          >
            ✕ Clear filter
          </button>
        </div>
      )}

      {/* ── Results count ── */}
      {(filter !== 'All' || search || duplicateGroupFilter) && (
        <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          Showing {visible.length} complaint{visible.length !== 1 ? 's' : ''}
          {filter !== 'All' ? ` · ${filter}` : ''}
          {search ? ` · "${search}"` : ''}
          {duplicateGroupFilter ? ' · Duplicate group' : ''}
        </p>
      )}

      {/* ── Bulk actions bar ── */}
      {selected.size > 0 && (
        <div className="bulk-bar">
          <span style={{ fontWeight: 700 }}>{selected.size} selected</span>
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className="adm-assign-select" style={{ width: 'auto', padding: '6px 10px' }}>
            <option value="">Set status…</option>
            {['Pending','Assigned','In Progress','Scheduled','Completed','Cancelled'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input
            placeholder="Reason (optional)"
            value={bulkReason}
            onChange={(e) => setBulkReason(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, flex: 1, minWidth: 120 }}
          />
          <IconBtn variant="primary" onClick={doBulkUpdate} disabled={!bulkStatus || bulking}>
            {bulking ? '…' : '✅ Apply'}
          </IconBtn>
          <IconBtn onClick={() => setSelected(new Set())}>✕ Clear</IconBtn>
        </div>
      )}

      {/* ── Complaint cards ── */}
      {visible.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: 60 }}>
          <p style={{ fontSize: 40, margin: 0 }}>📭</p>
          <p className="muted" style={{ marginTop: 12 }}>No complaints match this filter.</p>
          <button onClick={() => { setFilter('All'); setSearch(''); setDuplicateGroupFilter(null); }} style={{ marginTop: 8, fontSize: 13 }}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid">
          {visible.map((c) => {
            const sm = STATUS_META[c.status] || {};
            const pm = PRIORITY_META[c.priority] || {};
            const isAssigning = assigningId === c._id;
            const riskScore = riskScores[c._id] ?? null;
            const aiScore = aiScores[c._id];

            // Determine escalation risk level
            const riskLevel = riskScore !== null
              ? riskScore > 0.75 ? 'High' : riskScore > 0.5 ? 'Medium' : null
              : null;

            return (
              <div className="adm-card" key={c._id}>
                {/* Card top bar */}
                <div className="adm-card-top">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <h3 className="adm-card-title">{c.issueType}</h3>
                      <span
                        className="adm-priority-badge"
                        style={{ background: pm.bg, color: pm.color }}
                      >
                        {c.priority}
                      </span>
                      {/* ── Escalation risk badge ── */}
                      {riskLevel === 'High' && (
                        <span
                          title={`Escalation risk: ${(riskScore * 100).toFixed(0)}%`}
                          style={{
                            background: '#fee2e2',
                            color: '#b91c1c',
                            border: '1px solid #fca5a5',
                            borderRadius: 20,
                            padding: '2px 8px',
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          🔴 High Risk
                        </span>
                      )}
                      {riskLevel === 'Medium' && (
                        <span
                          title={`Escalation risk: ${(riskScore * 100).toFixed(0)}%`}
                          style={{
                            background: '#fef3c7',
                            color: '#92400e',
                            border: '1px solid #fcd34d',
                            borderRadius: 20,
                            padding: '2px 8px',
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          🟡 Medium Risk
                        </span>
                      )}
                      {/* ── Duplicate group badge ── */}
                      {c.duplicateGroupId && (
                        <button
                          onClick={() => setDuplicateGroupFilter(
                            duplicateGroupFilter === c.duplicateGroupId ? null : c.duplicateGroupId
                          )}
                          title="Filter to show all complaints in this duplicate group"
                          style={{
                            background: duplicateGroupFilter === c.duplicateGroupId ? '#0369a1' : '#f0f9ff',
                            color: duplicateGroupFilter === c.duplicateGroupId ? 'white' : '#0369a1',
                            border: '1px solid #7dd3fc',
                            borderRadius: 20,
                            padding: '2px 8px',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          🔗 Duplicate group
                        </button>
                      )}
                    </div>
                    <p className="adm-card-meta">
                      🏠 Apt {c.apartmentNo} &nbsp;·&nbsp; 👤 {c.residentName}
                    </p>
                  </div>
                  <span
                    className="adm-status-pill"
                    style={{ background: sm.bg, color: sm.color, border: `1px solid ${sm.border}` }}
                  >
                    {sm.icon} {c.status}
                  </span>
                </div>

                {/* Description */}
                <p className="adm-card-desc">
                  {c.description.slice(0, 110)}{c.description.length > 110 ? '…' : ''}
                </p>

                {/* Date / time / engineer row */}
                <div className="adm-card-info">
                  <span>📅 {c.preferredDate}</span>
                  <span>🕐 {c.preferredTime}</span>
                  <span
                    style={{
                      color: c.assignedTechnician?.name ? '#166534' : '#94a3b8',
                      fontWeight: c.assignedTechnician?.name ? 700 : 400,
                    }}
                  >
                    👷 {c.assignedTechnician?.name ?? 'Unassigned'}
                  </span>
                </div>

                {/* Feedback badge */}
                {c.feedbackSubmitted && (
                  <div className="adm-feedback-badge">
                    ⭐ Resident feedback
                    {c.feedback && (
                      <span className="adm-feedback-text">
                        &nbsp;"{ c.feedback.slice(0, 60)}{c.feedback.length > 60 ? '…' : ''}"
                      </span>
                    )}
                  </div>
                )}

                {/* ── Action icon bar ── */}
                <div className="adm-actions">
                  <Link to={`/complaints/${c._id}`} className="adm-icon-btn" title="View details">
                    👁️ View
                  </Link>

                  {!isAssigning && (
                    <IconBtn
                      title={c.assignedTechnician ? 'Reassign engineer' : 'Assign engineer'}
                      onClick={() => startAssign(c._id)}
                      variant="primary"
                    >
                      👷 {c.assignedTechnician ? 'Reassign' : 'Assign'}
                    </IconBtn>
                  )}

                  {!isAssigning && c.status !== 'Completed' && c.status !== 'Cancelled' && (
                    <IconBtn
                      title="Mark as Completed"
                      onClick={() => updateStatus(c._id, 'Completed')}
                      disabled={updatingId === c._id + 'Completed'}
                      variant="success"
                    >
                      ✅ Done
                    </IconBtn>
                  )}

                  {!isAssigning && c.status !== 'Cancelled' && c.status !== 'Completed' && (
                    <IconBtn
                      title="Cancel complaint"
                      onClick={() => updateStatus(c._id, 'Cancelled')}
                      disabled={updatingId === c._id + 'Cancelled'}
                      variant="danger"
                    >
                      🚫 Cancel
                    </IconBtn>
                  )}
                </div>

                {/* ── AI Score Assignment panel ── */}
                {isAssigning && (
                  <div className="adm-assign-panel">
                    <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 13 }}>
                      🤖 AI-Ranked Technicians:
                    </p>

                    {aiScore?.loading && (
                      <p className="muted" style={{ fontSize: 12, margin: '4px 0' }}>
                        Loading AI scores…
                      </p>
                    )}

                    {aiScore?.error && (
                      <div className="auth-error" style={{ margin: '6px 0', fontSize: 13 }}>
                        <span>⚠️</span> {aiScore.error} — showing all engineers below.
                      </div>
                    )}

                    {/* AI ranked list */}
                    {!aiScore?.loading && aiScore?.ranked?.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        {aiScore.ranked.map((tech) => {
                          const isSelected = selectedEngineerId === tech.technicianId;
                          const scoreColor =
                            tech.compositeScore >= 0.75 ? '#166534' :
                            tech.compositeScore >= 0.5  ? '#92400e' : '#b91c1c';
                          const scoreBg =
                            tech.compositeScore >= 0.75 ? '#dcfce7' :
                            tech.compositeScore >= 0.5  ? '#fef3c7' : '#fee2e2';
                          return (
                            <div
                              key={tech.technicianId}
                              onClick={() => setSelectedEngineerId(tech.technicianId)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '8px 10px',
                                borderRadius: 8,
                                marginBottom: 6,
                                cursor: 'pointer',
                                border: isSelected ? '2px solid #2563eb' : '1.5px solid #e2e8f0',
                                background: isSelected ? '#eff6ff' : '#f8fafc',
                                transition: 'border .15s, background .15s',
                              }}
                            >
                              <span style={{ fontSize: 14 }}>
                                {tech.isOnline ? '🟢' : '⚫'}
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 13 }}>{tech.name}</div>
                                <div style={{ fontSize: 11, color: '#64748b' }}>
                                  {tech.skillType} · {tech.remainingSlotsToday} slot{tech.remainingSlotsToday !== 1 ? 's' : ''} left
                                </div>
                              </div>
                              <span
                                style={{
                                  background: scoreBg,
                                  color: scoreColor,
                                  border: `1px solid ${scoreColor}33`,
                                  borderRadius: 20,
                                  padding: '2px 8px',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  whiteSpace: 'nowrap',
                                }}
                                title={`Skill: ${tech.skillMatchScore} · Workload: ${tech.workloadScore} · Performance: ${tech.performanceScore}`}
                              >
                                ⭐ {(tech.compositeScore * 100).toFixed(0)}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* No AI candidates message */}
                    {!aiScore?.loading && aiScore?.reason && (
                      <p className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
                        {aiScore.reason}
                      </p>
                    )}

                    {/* Fallback: plain engineer select when AI scores unavailable */}
                    {(aiScore?.error || (!aiScore?.loading && !aiScore?.ranked?.length && !aiScore?.reason)) && (
                      <>
                        <select
                          value={selectedEngineerId}
                          onChange={(e) => setSelectedEngineerId(e.target.value)}
                          className="adm-assign-select"
                        >
                          <option value="">— Choose engineer —</option>
                          {engineers.filter((eng) => eng.remainingSlotsToday > 0).map((eng) => (
                            <option key={eng._id} value={eng._id}>
                              {eng.isOnline ? '🟢' : '⚫'} {eng.user?.name} — {eng.skillType} ({eng.remainingSlotsToday} slots left)
                            </option>
                          ))}
                        </select>
                        {engineers.filter((e) => e.remainingSlotsToday > 0).length === 0 && (
                          <p className="muted" style={{ fontSize: 12, margin: '4px 0' }}>
                            No engineers with available slots today.
                          </p>
                        )}
                      </>
                    )}

                    {assignError && (
                      <div className="auth-error" style={{ margin: '6px 0', fontSize: 13 }}>
                        <span>⚠️</span> {assignError}
                      </div>
                    )}
                    <div className="row" style={{ gap: 8, marginTop: 10 }}>
                      <IconBtn
                        variant="primary"
                        onClick={() => confirmAssign(c._id)}
                        disabled={!selectedEngineerId}
                        title="Confirm assignment"
                      >
                        ✅ Confirm
                      </IconBtn>
                      <IconBtn onClick={cancelAssign} title="Cancel">
                        ✕ Cancel
                      </IconBtn>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── Resident Dashboard ───────────────────────────────────────────────────────
function ResidentDashboard() {
  const [complaints, setComplaints] = useState([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('All');

  // Per-complaint feedback state  { [id]: { text, submitting, msg, error } }
  const [feedbackState, setFeedbackState] = useState({});
  // Track which card is showing the feedback form
  const [feedbackOpenId, setFeedbackOpenId] = useState(null);
  // Track completing in progress
  const [completingId, setCompletingId] = useState(null);
  // Notify state { [id]: { sending, result } }
  const [notifyState, setNotifyState] = useState({});

  const load = async () => {
    try {
      const { data } = await api.get('/complaints');
      const list = data?.complaints ?? (Array.isArray(data) ? data : []);
      setComplaints(list);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load complaints');
    }
  };

  useEffect(() => { load(); }, []);

  const markResolved = async (id) => {
    setCompletingId(id);
    try {
      await api.patch(`/complaints/${id}/status`, { status: 'Completed' });
      await load();
      // Auto-open feedback form after marking complete
      setFeedbackOpenId(id);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to mark as resolved');
    } finally {
      setCompletingId(null);
    }
  };

  const setFeedbackText = (id, text) => {
    setFeedbackState((prev) => ({ ...prev, [id]: { ...prev[id], text } }));
  };

  const submitFeedback = async (id) => {
    const text = feedbackState[id]?.text?.trim();
    if (!text) return;
    setFeedbackState((prev) => ({ ...prev, [id]: { ...prev[id], submitting: true, msg: '', error: '' } }));
    try {
      await api.post(`/complaints/${id}/feedback`, { feedback: text });
      setFeedbackState((prev) => ({ ...prev, [id]: { text: '', submitting: false, msg: '✅ Thank you for your feedback!', error: '' } }));
      setFeedbackOpenId(null);
      await load();
    } catch (err) {
      setFeedbackState((prev) => ({
        ...prev,
        [id]: { ...prev[id], submitting: false, error: err.response?.data?.message || 'Failed to submit feedback' }
      }));
    }
  };

  const sendNotification = async (id, channel) => {
    setNotifyState((prev) => ({ ...prev, [id]: { ...prev[id], [channel]: { sending: true, result: null } } }));
    try {
      const { data } = await api.post(`/complaints/${id}/notify`, { channel });
      const r = data.results?.[channel];
      setNotifyState((prev) => ({
        ...prev,
        [id]: { ...prev[id], [channel]: { sending: false, result: r?.mocked ? '📨 Sent (mock)' : r?.sent ? '✅ Sent!' : `❌ ${r?.error}` } }
      }));
    } catch (err) {
      setNotifyState((prev) => ({
        ...prev,
        [id]: { ...prev[id], [channel]: { sending: false, result: `❌ ${err.response?.data?.message || 'Failed'}` } }
      }));
    }
    // Clear result after 4s
    setTimeout(() => {
      setNotifyState((prev) => ({ ...prev, [id]: { ...prev[id], [channel]: { sending: false, result: null } } }));
    }, 4000);
  };

  const statuses = ['All', 'Pending', 'Assigned', 'Scheduled', 'Completed', 'Cancelled'];
  const visible = filter === 'All' ? complaints : complaints.filter((c) => c.status === filter);

  return (
    <section>
      <div className="row between" style={{ marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0 }}>My Complaints</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>{complaints.length} submitted</p>
        </div>
        <Link className="primary" to="/create-complaint">+ New Complaint</Link>
      </div>

      {error && <p className="error">{error}</p>}

      {/* Filter tabs */}
      <div className="filter-tabs">
        {statuses.map((s) => (
          <button
            key={s}
            className={filter === s ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setFilter(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: 60 }}>
          <p className="muted">No complaints yet.</p>
          <Link className="primary" to="/create-complaint">Submit your first complaint</Link>
        </div>
      ) : (
        <div className="grid">
          {visible.map((c) => {
            const fb = feedbackState[c._id] || {};
            const canResolve = ['Assigned', 'Scheduled'].includes(c.status);
            const canFeedback = c.status === 'Completed' && !c.feedbackSubmitted;
            const feedbackOpen = feedbackOpenId === c._id;

            return (
              <div className="card" key={c._id}>
                <div className="row between">
                  <h3 style={{ margin: 0 }}>{c.issueType}</h3>
                  <span className={`pill ${c.priority.toLowerCase()}`}>{c.priority}</span>
                </div>
                <p className="muted" style={{ margin: '6px 0' }}>Apt {c.apartmentNo}</p>
                <p style={{ margin: '0 0 8px', fontSize: 14 }}>
                  {c.description.slice(0, 100)}{c.description.length > 100 ? '…' : ''}
                </p>

                <div className="meta-row">
                  <span>📅 {c.preferredDate}</span>
                  <span>🕐 {c.preferredTime}</span>
                </div>

                <div className="row between" style={{ marginTop: 10 }}>
                  <span className={`status-badge status-${c.status.toLowerCase()}`}>{c.status}</span>
                  {c.assignedTechnician?.name && (
                    <span className="muted" style={{ fontSize: 13 }}>👷 {c.assignedTechnician.name}</span>
                  )}
                </div>

                <Link to={`/complaints/${c._id}`} style={{ fontSize: 13, display: 'block', marginTop: 10 }}>
                  View details →
                </Link>

                {/* ── Notify buttons ── */}
                <div className="notify-row">
                  <button
                    className="btn-notify-email"
                    onClick={() => sendNotification(c._id, 'email')}
                    disabled={notifyState[c._id]?.email?.sending}
                    title="Send complaint details to maintenance email"
                  >
                    {notifyState[c._id]?.email?.sending ? '…' : '📧 Email'}
                  </button>
                  <button
                    className="btn-notify-wa"
                    onClick={() => sendNotification(c._id, 'whatsapp')}
                    disabled={notifyState[c._id]?.whatsapp?.sending}
                    title="Send complaint via WhatsApp"
                  >
                    {notifyState[c._id]?.whatsapp?.sending ? '…' : '💬 WhatsApp'}
                  </button>
                  {notifyState[c._id]?.email?.result && (
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{notifyState[c._id].email.result}</span>
                  )}
                  {notifyState[c._id]?.whatsapp?.result && (
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{notifyState[c._id].whatsapp.result}</span>
                  )}
                </div>

                {/* ── Issue Resolved button ── */}
                {canResolve && (
                  <div style={{ marginTop: 12 }}>
                    <button
                      onClick={() => markResolved(c._id)}
                      disabled={completingId === c._id}
                      className="btn-resolved"
                    >
                      {completingId === c._id ? 'Updating…' : '✅ Issue Resolved'}
                    </button>
                    <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                      Click when the technician has fixed the issue
                    </p>
                  </div>
                )}

                {/* ── Feedback section ── */}
                {c.status === 'Completed' && (
                  <div style={{ marginTop: 12, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                    {c.feedbackSubmitted ? (
                      <div className="feedback-submitted">
                        <span>⭐ Feedback submitted</span>
                        {c.feedback && (
                          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#475569', fontStyle: 'italic' }}>
                            "{c.feedback}"
                          </p>
                        )}
                      </div>
                    ) : feedbackOpen ? (
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>
                          How was the service? Leave your feedback:
                        </label>
                        <textarea
                          rows={3}
                          placeholder="e.g. The technician was prompt and fixed the issue quickly…"
                          value={fb.text || ''}
                          onChange={(e) => setFeedbackText(c._id, e.target.value)}
                          style={{ fontSize: 13, minHeight: 80, marginBottom: 8 }}
                        />
                        {fb.error && <p className="error" style={{ margin: '0 0 6px', fontSize: 13 }}>{fb.error}</p>}
                        <div className="row" style={{ gap: 8 }}>
                          <button
                            className="primary"
                            onClick={() => submitFeedback(c._id)}
                            disabled={fb.submitting || !fb.text?.trim()}
                          >
                            {fb.submitting ? 'Submitting…' : 'Submit Feedback'}
                          </button>
                          <button onClick={() => setFeedbackOpenId(null)}>Later</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setFeedbackOpenId(c._id)}
                        className="btn-feedback"
                      >
                        💬 Leave Feedback
                      </button>
                    )}
                    {fb.msg && <p className="success" style={{ marginTop: 8, fontSize: 13 }}>{fb.msg}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── Root export — picks the right view by role ───────────────────────────────
export default function Dashboard() {
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  if (!user) return <Navigate to="/login" />;

  // Technicians have their own dedicated portal
  if (user.role === 'technician') return <Navigate to="/my-work" />;

  if (user.role === 'admin') return <AdminDashboard />;

  return <ResidentDashboard />;
}
