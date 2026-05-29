import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../services/api.js';

// ── helpers ───────────────────────────────────────────────────────────────────
function toMinutes(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function fmt12(hhmm) {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function nowHHMM() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}

// Auto-compute slots from start→end (1 slot per hour)
function autoSlots(start, end) {
  const diff = toMinutes(end) - toMinutes(start);
  return diff > 0 ? Math.floor(diff / 60) : 0;
}

// ── WorkingHoursBar ───────────────────────────────────────────────────────────
function WorkingHoursBar({ joiningTime, endTime }) {
  const [now, setNow] = useState(nowHHMM());

  useEffect(() => {
    const id = setInterval(() => setNow(nowHHMM()), 60_000);
    return () => clearInterval(id);
  }, []);

  const startMin = toMinutes(joiningTime);
  const endMin   = toMinutes(endTime || '18:00');
  const nowMin   = toMinutes(now);
  const shiftLen = Math.max(0, endMin - startMin);

  const elapsed   = Math.max(0, Math.min(shiftLen, nowMin - startMin));
  const remaining = Math.max(0, endMin - nowMin);
  const pct       = shiftLen > 0 ? Math.round((elapsed / shiftLen) * 100) : 0;

  const shiftOver   = nowMin >= endMin;
  const shiftNotYet = nowMin < startMin;

  const remH = Math.floor(remaining / 60);
  const remM = remaining % 60;
  const remLabel = remaining === 0 ? 'Shift ended'
    : remH > 0 ? `${remH}h ${remM}m left`
    : `${remM}m left`;

  const barColor = pct >= 100 ? '#dc2626' : pct >= 75 ? '#f59e0b' : '#22c55e';

  return (
    <div className="card working-hours-card" style={{ marginBottom: 20 }}>
      <div className="row between" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Working Hours
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
            {fmt12(joiningTime)}
            <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 16 }}> → </span>
            {fmt12(endTime || '18:00')}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontSize: 26, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#1e40af' }}>
            {fmt12(now)}
          </p>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
            {shiftNotYet ? '⏳ Shift not started' : shiftOver ? '🔴 Shift ended' : `🟢 ${remLabel}`}
          </p>
        </div>
      </div>

      <div style={{ position: 'relative', marginBottom: 6 }}>
        <div style={{ background: '#e2e8f0', borderRadius: 999, height: 10, overflow: 'visible', position: 'relative' }}>
          <div style={{
            height: '100%', borderRadius: 999,
            width: `${Math.min(pct, 100)}%`,
            background: barColor,
            transition: 'width .6s ease, background .4s ease'
          }} />
          {!shiftNotYet && !shiftOver && (
            <div style={{
              position: 'absolute', top: '50%',
              left: `${Math.min(pct, 100)}%`,
              transform: 'translate(-50%, -50%)',
              width: 16, height: 16, borderRadius: '50%',
              background: barColor, border: '3px solid white',
              boxShadow: `0 0 0 3px ${barColor}44`, zIndex: 2
            }} />
          )}
        </div>
        <div className="row between" style={{ marginTop: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>🟢 {fmt12(joiningTime)}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>🔴 {fmt12(endTime || '18:00')}</span>
        </div>
      </div>

      <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        <div className="time-chip time-chip-elapsed">
          <span className="time-chip-val">{Math.floor(elapsed / 60)}h {elapsed % 60}m</span>
          <span className="time-chip-lbl">Elapsed</span>
        </div>
        <div className="time-chip time-chip-remaining">
          <span className="time-chip-val">{remH}h {remM}m</span>
          <span className="time-chip-lbl">Remaining</span>
        </div>
        <div className="time-chip time-chip-total">
          <span className="time-chip-val">{Math.floor(shiftLen / 60)}h {shiftLen % 60}m</span>
          <span className="time-chip-lbl">Total Shift</span>
        </div>
        <div className="time-chip time-chip-pct">
          <span className="time-chip-val">{pct}%</span>
          <span className="time-chip-lbl">Complete</span>
        </div>
      </div>
    </div>
  );
}

// ── ScheduleEditor ────────────────────────────────────────────────────────────
function ScheduleEditor({ profile, onSaved }) {
  const [open, setOpen]           = useState(false);
  const [startTime, setStartTime] = useState(profile.joiningTime || '09:00');
  const [endTime, setEndTime]     = useState(profile.endTime || '18:00');
  const [slotMode, setSlotMode]   = useState('auto'); // 'auto' | 'manual'
  const [manualSlots, setManualSlots] = useState(String(profile.dailySlotCapacity || 1));
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState('');
  const [err, setErr]             = useState('');

  // Keep form in sync if profile changes externally
  useEffect(() => {
    setStartTime(profile.joiningTime || '09:00');
    setEndTime(profile.endTime || '18:00');
    setManualSlots(String(profile.dailySlotCapacity || 1));
  }, [profile]);

  const preview = slotMode === 'auto'
    ? autoSlots(startTime, endTime)
    : parseInt(manualSlots, 10) || 0;

  const save = async () => {
    setMsg(''); setErr('');
    setSaving(true);
    try {
      const body = {
        joiningTime: startTime,
        endTime,
        ...(slotMode === 'manual' ? { dailySlotCapacity: parseInt(manualSlots, 10) } : {})
      };
      const { data } = await api.patch('/engineers/me/profile', body);
      onSaved(data);
      setMsg(`✅ Saved! ${data.joiningTime} → ${data.endTime} · ${data.dailySlotCapacity} slots/day`);
      setOpen(false);
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
      {!open ? (
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => setOpen(true)} style={{ fontSize: 13 }}>
            ✏️ Edit schedule &amp; slots
          </button>
          {msg && <p className="success" style={{ margin: 0, fontSize: 13 }}>{msg}</p>}
        </div>
      ) : (
        <div>
          <p style={{ margin: '0 0 12px', fontWeight: 700, fontSize: 14 }}>Edit Schedule &amp; Slots</p>

          {/* Time inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label className="field-label">Start Time</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">End Time</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          {/* Slot mode toggle */}
          <div style={{ marginBottom: 12 }}>
            <label className="field-label">Daily Slot Capacity</label>
            <div className="row" style={{ gap: 8, marginBottom: 8 }}>
              <button
                onClick={() => setSlotMode('auto')}
                style={{
                  fontSize: 12, padding: '6px 14px', borderRadius: 999,
                  background: slotMode === 'auto' ? '#2563eb' : '#f1f5f9',
                  color: slotMode === 'auto' ? 'white' : '#475569',
                  fontWeight: 700, border: 'none', cursor: 'pointer'
                }}
              >
                Auto (from hours)
              </button>
              <button
                onClick={() => setSlotMode('manual')}
                style={{
                  fontSize: 12, padding: '6px 14px', borderRadius: 999,
                  background: slotMode === 'manual' ? '#2563eb' : '#f1f5f9',
                  color: slotMode === 'manual' ? 'white' : '#475569',
                  fontWeight: 700, border: 'none', cursor: 'pointer'
                }}
              >
                Manual
              </button>
            </div>

            {slotMode === 'manual' ? (
              <input
                type="number"
                min="1"
                max="24"
                value={manualSlots}
                onChange={(e) => setManualSlots(e.target.value)}
                placeholder="e.g. 8"
              />
            ) : (
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                Auto-computed: <b>{preview} slot{preview !== 1 ? 's' : ''}</b> (1 slot per hour between {startTime} and {endTime})
              </p>
            )}
          </div>

          {/* Preview */}
          <div className="schedule-preview">
            <span>🕐 {fmt12(startTime)}</span>
            <span style={{ color: '#94a3b8' }}>→</span>
            <span>🕕 {fmt12(endTime)}</span>
            <span style={{ color: '#94a3b8' }}>·</span>
            <span><b>{preview}</b> slot{preview !== 1 ? 's' : ''}/day</span>
          </div>

          {err && <p className="error" style={{ marginTop: 8, fontSize: 13 }}>{err}</p>}

          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button className="primary" onClick={save} disabled={saving || preview < 1}>
              {saving ? 'Saving…' : 'Save Schedule'}
            </button>
            <button onClick={() => { setOpen(false); setErr(''); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EngineerPortal() {
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  // All hooks must be called unconditionally before any early return
  const [complaints, setComplaints]         = useState([]);
  const [profile, setProfile]               = useState(null);
  const [error, setError]                   = useState('');
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [updatingId, setUpdatingId]         = useState(null);

  const loadComplaints = async () => {
    try {
      const { data } = await api.get('/complaints');
      const arr = Array.isArray(data) ? data : data.complaints ?? [];
      const sorted = [...arr].sort((a, b) =>
        a.preferredDate < b.preferredDate ? -1 : a.preferredDate > b.preferredDate ? 1 : 0
      );
      setComplaints(sorted);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load complaints');
    }
  };

  const loadProfile = async () => {
    try {
      const { data } = await api.get('/engineers/me');
      setProfile(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load profile');
    }
  };

  useEffect(() => {
    loadComplaints();
    loadProfile();
  }, []);

  // Guard after all hooks
  if (!user || user.role !== 'technician') {
    return <Navigate to="/dashboard" />;
  }

  const toggleOnline = async () => {
    if (!profile) return;
    setTogglingStatus(true);
    try {
      const { data } = await api.patch('/engineers/me/status', { isOnline: !profile.isOnline });
      setProfile((p) => ({ ...p, isOnline: data.isOnline }));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status');
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleScheduleSaved = (data) => {
    setProfile((p) => ({
      ...p,
      joiningTime: data.joiningTime,
      endTime: data.endTime,
      dailySlotCapacity: data.dailySlotCapacity
    }));
  };

  // Technician status update
  const updateStatus = async (id, status) => {
    setUpdatingId(id + status);
    try {
      await api.patch(`/complaints/${id}/status`, { status });
      await loadComplaints();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  };

  // Slot computation
  const today           = new Date().toISOString().split('T')[0];
  const todayComplaints = complaints.filter((c) => c.preferredDate === today && c.status !== 'Cancelled');
  const usedToday       = todayComplaints.length;
  const capacity        = profile?.dailySlotCapacity ?? 0;
  const remainingToday  = Math.max(0, capacity - usedToday);
  const slotPct         = capacity > 0 ? Math.round((usedToday / capacity) * 100) : 0;
  const isOnline        = profile?.isOnline ?? false;

  return (
    <section>
      {/* Header */}
      <div className="row between" style={{ marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>My Work</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {complaints.length} complaint{complaints.length !== 1 ? 's' : ''} assigned total
          </p>
        </div>
        <button
          onClick={toggleOnline}
          disabled={togglingStatus || !profile}
          className={isOnline ? 'btn-online' : 'btn-offline'}
        >
          <span className={`status-dot ${isOnline ? 'dot-online' : 'dot-offline'}`} />
          {togglingStatus ? 'Updating…' : isOnline ? 'Online' : 'Offline'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {/* Working hours timeline */}
      {profile?.joiningTime && (
        <WorkingHoursBar joiningTime={profile.joiningTime} endTime={profile.endTime || '18:00'} />
      )}

      {/* Today's slot summary */}
      {profile && (
        <div className="card slot-summary-card" style={{ marginBottom: 20 }}>
          <div className="row between" style={{ flexWrap: 'wrap', gap: 16 }}>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Today's Slots — {today}
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 800, color: remainingToday > 0 ? '#0369a1' : '#dc2626' }}>
                {remainingToday}
                <span style={{ fontSize: 15, fontWeight: 500, color: '#64748b' }}> / {capacity} remaining</span>
              </p>
            </div>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <div className="slot-chip slot-chip-used">
                <span className="slot-chip-val">{usedToday}</span>
                <span className="slot-chip-lbl">Used</span>
              </div>
              <div className="slot-chip slot-chip-free">
                <span className="slot-chip-val">{remainingToday}</span>
                <span className="slot-chip-lbl">Free</span>
              </div>
              <div className="slot-chip slot-chip-total">
                <span className="slot-chip-val">{capacity}</span>
                <span className="slot-chip-lbl">Total</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ background: '#e2e8f0', borderRadius: 999, height: 8, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 999, width: `${slotPct}%`,
                background: slotPct >= 100 ? '#dc2626' : slotPct >= 75 ? '#f59e0b' : '#22c55e',
                transition: 'width .4s ease'
              }} />
            </div>
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 0', textAlign: 'right' }}>
              {slotPct}% booked today
            </p>
          </div>

          {todayComplaints.length > 0 && (
            <div style={{ marginTop: 14, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                Today's jobs
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {todayComplaints.map((c) => (
                  <div key={c._id} className="row between" style={{ background: '#f8fafc', borderRadius: 10, padding: '8px 12px' }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{c.issueType}</span>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="muted" style={{ fontSize: 12 }}>Apt {c.apartmentNo}</span>
                      <span className={`status-badge status-${c.status.toLowerCase()}`}>{c.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Profile + schedule editor */}
      {profile && (
        <div className="card profile-card" style={{ marginBottom: 28 }}>
          <div className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>{profile.user?.name}</p>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>{profile.user?.email}</p>
            </div>
            <div className="row" style={{ gap: 20, flexWrap: 'wrap' }}>
              <div className="profile-stat">
                <span className="profile-stat-val">{profile.skillType}</span>
                <span className="profile-stat-lbl">Skill</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-val">{profile.joiningTime}</span>
                <span className="profile-stat-lbl">Start</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-val">{profile.endTime || '18:00'}</span>
                <span className="profile-stat-lbl">End</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-val">{capacity}</span>
                <span className="profile-stat-lbl">Slots/Day</span>
              </div>
            </div>
          </div>

          <ScheduleEditor profile={profile} onSaved={handleScheduleSaved} />
        </div>
      )}

      {/* All assigned complaints */}
      <h3 style={{ margin: '0 0 14px' }}>All Assigned Complaints</h3>
      {complaints.length === 0 && !error ? (
        <p className="muted" style={{ textAlign: 'center', marginTop: 20 }}>
          No complaints assigned to you yet.
        </p>
      ) : (
        <div className="grid">
          {complaints.map((c) => (
            <div
              className="card"
              key={c._id}
              style={{ borderLeft: c.preferredDate === today ? '4px solid #2563eb' : '4px solid transparent' }}
            >
              <div className="row between">
                <h3 style={{ margin: 0 }}>{c.issueType}</h3>
                <span className={`pill ${c.priority.toLowerCase()}`}>{c.priority}</span>
              </div>
              <p className="muted" style={{ margin: '6px 0' }}>Apt {c.apartmentNo}</p>
              <div className="meta-row">
                <span>📅 {c.preferredDate}{c.preferredDate === today ? ' · Today' : ''}</span>
                <span>🕐 {c.preferredTime}</span>
              </div>
              <div style={{ marginTop: 8 }}>
                <span className={`status-badge status-${c.status.toLowerCase().replace(' ', '-')}`}>{c.status}</span>
              </div>
              <p style={{ marginTop: 10, fontSize: 14, color: '#475569' }}>{c.description}</p>

              {/* Technician status actions */}
              <div className="adm-actions" style={{ marginTop: 12 }}>
                {c.status === 'Assigned' && (
                  <button
                    onClick={() => updateStatus(c._id, 'In Progress')}
                    disabled={updatingId === c._id + 'In Progress'}
                    style={{ background: '#ede9fe', color: '#6d28d9', border: 'none', borderRadius: 10, padding: '7px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                  >
                    🔧 Start Work
                  </button>
                )}
                {(c.status === 'Assigned' || c.status === 'In Progress') && (
                  <button
                    onClick={() => updateStatus(c._id, 'Completed')}
                    disabled={updatingId === c._id + 'Completed'}
                    style={{ background: '#dcfce7', color: '#166534', border: 'none', borderRadius: 10, padding: '7px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                  >
                    ✅ Mark Complete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
