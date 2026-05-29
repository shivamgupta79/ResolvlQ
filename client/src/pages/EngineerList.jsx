import { useEffect, useState } from 'react';
import api from '../services/api.js';

export default function EngineerList() {
  const [engineers, setEngineers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('All');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/engineers');
      setEngineers(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load engineers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filters = ['All', 'Online', 'Offline', 'Available', 'Fully Booked'];

  const visible = engineers.filter((eng) => {
    if (filter === 'Online') return eng.isOnline;
    if (filter === 'Offline') return !eng.isOnline;
    if (filter === 'Available') return eng.available;
    if (filter === 'Fully Booked') return !eng.available;
    return true;
  });

  const onlineCount = engineers.filter((e) => e.isOnline).length;
  const availableCount = engineers.filter((e) => e.available).length;

  return (
    <section>
      {/* Header */}
      <div className="row between" style={{ marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0 }}>Engineers</h2>
          {!loading && !error && (
            <p className="muted" style={{ margin: '4px 0 0' }}>
              {engineers.length} registered · {onlineCount} online · {availableCount} available today
            </p>
          )}
        </div>
        <button onClick={load} disabled={loading} style={{ fontSize: 13 }}>
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 14, padding: '14px 18px', marginBottom: 20 }}>
          <p className="error" style={{ margin: 0 }}>{error}</p>
          <button onClick={load} style={{ marginTop: 10, fontSize: 13 }}>Try again</button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card" style={{ opacity: 0.4, minHeight: 160 }}>
              <div style={{ background: '#e2e8f0', borderRadius: 8, height: 18, width: '60%', marginBottom: 10 }} />
              <div style={{ background: '#e2e8f0', borderRadius: 8, height: 14, width: '40%', marginBottom: 8 }} />
              <div style={{ background: '#e2e8f0', borderRadius: 8, height: 14, width: '80%' }} />
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      {!loading && !error && (
        <>
          <div className="filter-tabs" style={{ marginBottom: 20 }}>
            {filters.map((f) => (
              <button
                key={f}
                className={filter === f ? 'tab-btn active' : 'tab-btn'}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>

          {engineers.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: 60 }}>
              <p style={{ fontSize: 40, margin: 0 }}>👷</p>
              <p className="muted" style={{ marginTop: 12 }}>No engineers registered yet.</p>
              <p className="muted" style={{ fontSize: 13 }}>Engineers appear here once they register with the technician role.</p>
            </div>
          ) : visible.length === 0 ? (
            <p className="muted" style={{ textAlign: 'center', marginTop: 40 }}>No engineers match this filter.</p>
          ) : (
            <div className="grid">
              {visible.map((eng) => (
                <div className="card" key={eng._id} style={{ position: 'relative' }}>
                  {/* Online dot */}
                  <span
                    className={`status-dot ${eng.isOnline ? 'dot-online' : 'dot-offline'}`}
                    style={{ position: 'absolute', top: 20, right: 20, width: 12, height: 12 }}
                    title={eng.isOnline ? 'Online' : 'Offline'}
                  />

                  <div style={{ paddingRight: 24, marginBottom: 8 }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>{eng.user?.name ?? '—'}</p>
                    <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>{eng.user?.email ?? '—'}</p>
                  </div>

                  {/* Status badges */}
                  <div className="row" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                    <span className={`pill ${eng.isOnline ? 'pill-online' : 'pill-offline'}`}>
                      {eng.isOnline ? '🟢 Online' : '⚫ Offline'}
                    </span>
                    <span className={`pill ${eng.available ? 'low' : 'high'}`}>
                      {eng.available ? 'Available' : 'Fully Booked'}
                    </span>
                  </div>

                  {/* Stats grid */}
                  <div className="eng-stats">
                    <div className="eng-stat">
                      <span className="eng-stat-val" style={{ fontSize: 12 }}>{eng.skillType ?? '—'}</span>
                      <span className="eng-stat-lbl">Skill</span>
                    </div>
                    <div className="eng-stat">
                      <span className="eng-stat-val">{eng.joiningTime ?? '—'}</span>
                      <span className="eng-stat-lbl">Start Time</span>
                    </div>
                    <div className="eng-stat">
                      <span className="eng-stat-val">{eng.dailySlotCapacity ?? 0}</span>
                      <span className="eng-stat-lbl">Capacity</span>
                    </div>
                    <div className="eng-stat">
                      <span
                        className="eng-stat-val"
                        style={{ color: eng.remainingSlotsToday > 0 ? '#16a34a' : '#dc2626' }}
                      >
                        {eng.remainingSlotsToday ?? 0}
                      </span>
                      <span className="eng-stat-lbl">Slots Left</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
