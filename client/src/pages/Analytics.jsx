import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import api from '../services/api.js';
import { getAnomalies, resolveAnomaly, getFollowUpRequired } from '../services/api.js';

const COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];
const SENTIMENT_COLORS = { Positive: '#16a34a', Neutral: '#d97706', Negative: '#dc2626' };

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div className="analytics-stat-card">
      <div className="analytics-stat-icon" style={{ background: color + '22', color }}>{icon}</div>
      <div>
        <p className="analytics-stat-val" style={{ color }}>{value ?? '—'}</p>
        <p className="analytics-stat-lbl">{label}</p>
        {sub && <p className="analytics-stat-sub">{sub}</p>}
      </div>
    </div>
  );
}

export default function Analytics() {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!user || user.role !== 'admin') return <Navigate to="/dashboard" />;

  const [overview, setOverview]             = useState(null);
  const [weekly, setWeekly]                 = useState([]);
  const [byIssue, setByIssue]               = useState([]);
  const [byPriority, setByPriority]         = useState([]);
  const [engineers, setEngineers]           = useState([]);
  const [anomalies, setAnomalies]           = useState([]);
  const [followUpCount, setFollowUpCount]   = useState(null);
  const [resolutionAccuracy, setResolutionAccuracy] = useState([]);
  const [sentimentDist, setSentimentDist]   = useState([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/analytics/overview'),
      api.get('/analytics/by-week'),
      api.get('/analytics/by-issue'),
      api.get('/analytics/by-priority'),
      api.get('/analytics/engineer-performance'),
      getAnomalies(),
      getFollowUpRequired(),
      api.get('/analytics/resolution-accuracy'),
      api.get('/analytics/sentiment-distribution'),
    ])
      .then(([ov, wk, iss, pri, eng, anom, followUp, resAcc, sentDist]) => {
        setOverview(ov.data);
        setWeekly(wk.data);
        setByIssue(iss.data);
        setByPriority(pri.data);
        setEngineers(eng.data);
        setAnomalies(anom.data?.alerts ?? []);
        // follow-up response: { complaints: [...] }
        setFollowUpCount(followUp.data?.complaints?.length ?? 0);
        setResolutionAccuracy(resAcc.data);
        setSentimentDist(sentDist.data);
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load analytics'))
      .finally(() => setLoading(false));
  }, []);

  const handleResolveAnomaly = async (alertId) => {
    try {
      await resolveAnomaly(alertId);
      setAnomalies((prev) => prev.filter((a) => a._id !== alertId));
    } catch (err) {
      console.error('Failed to resolve anomaly:', err.message);
    }
  };

  if (loading) return <p className="muted" style={{ textAlign: 'center', marginTop: 60 }}>Loading analytics…</p>;
  if (error)   return <div className="auth-error"><span>⚠️</span> {error}</div>;

  return (
    <section>
      <div className="adm-header">
        <div>
          <h2 style={{ margin: 0 }}>Analytics</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>System-wide performance overview</p>
        </div>
      </div>

      {/* ── Overview stat cards ── */}
      <div className="analytics-stats">
        <StatCard icon="📋" label="Total Complaints" value={overview?.total} color="#2563eb" />
        <StatCard icon="⏳" label="Pending" value={overview?.pending} color="#d97706" />
        <StatCard icon="👷" label="Assigned" value={overview?.assigned} color="#2563eb" />
        <StatCard icon="🔧" label="In Progress" value={overview?.inProgress} color="#7c3aed" />
        <StatCard icon="✅" label="Completed" value={overview?.completed} color="#16a34a" />
        <StatCard icon="⏱️" label="Avg Resolution" value={overview?.avgResolutionHours != null ? `${overview.avgResolutionHours}h` : '—'} color="#0891b2" sub="time to complete" />
        <StatCard icon="⭐" label="Avg Rating" value={overview?.avgRating ?? '—'} color="#f59e0b" sub={`${overview?.feedbackCount ?? 0} reviews`} />
        <StatCard icon="🚫" label="Cancelled" value={overview?.cancelled} color="#dc2626" />
        <StatCard icon="⚠️" label="Follow-up Required" value={followUpCount} color="#f59e0b" sub="negative feedback" />
      </div>

      {/* ── Weekly trend ── */}
      <div className="analytics-chart-card">
        <h3 className="analytics-chart-title">Weekly Complaints — Created vs Resolved</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={weekly} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="week" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="created" name="Created" fill="#2563eb" radius={[4, 4, 0, 0]} />
            <Bar dataKey="resolved" name="Resolved" fill="#16a34a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Issue type + Priority ── */}
      <div className="analytics-two-col">
        <div className="analytics-chart-card">
          <h3 className="analytics-chart-title">Complaints by Issue Type</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={byIssue} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {byIssue.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="analytics-chart-card">
          <h3 className="analytics-chart-title">Complaints by Priority</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={byPriority} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {byPriority.map((entry) => {
                  const c = { Low: '#16a34a', Medium: '#d97706', High: '#dc2626', Urgent: '#7f1d1d' }[entry.name] || '#94a3b8';
                  return <Cell key={entry.name} fill={c} />;
                })}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Engineer performance table ── */}
      <div className="analytics-chart-card">
        <h3 className="analytics-chart-title">Engineer Performance</h3>
        {engineers.length === 0 ? (
          <p className="muted">No engineer data yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Engineer</th>
                  <th>Skill</th>
                  <th>Assigned</th>
                  <th>Completed</th>
                  <th>Completion %</th>
                  <th>Avg Rating</th>
                </tr>
              </thead>
              <tbody>
                {engineers.map((e) => (
                  <tr key={e.name}>
                    <td style={{ fontWeight: 700 }}>{e.name}</td>
                    <td>{e.skillType}</td>
                    <td>{e.assigned}</td>
                    <td>{e.completed}</td>
                    <td>
                      <div className="analytics-progress-wrap">
                        <div
                          className="analytics-progress-bar"
                          style={{ width: `${e.assigned > 0 ? Math.round((e.completed / e.assigned) * 100) : 0}%` }}
                        />
                        <span>{e.assigned > 0 ? Math.round((e.completed / e.assigned) * 100) : 0}%</span>
                      </div>
                    </td>
                    <td>{e.avgRating ? `⭐ ${e.avgRating}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Anomaly Alerts ── */}
      <div className="analytics-chart-card">
        <h3 className="analytics-chart-title">🚨 Anomaly Alerts</h3>
        {anomalies.length === 0 ? (
          <p className="muted">No active anomaly alerts.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Issue Type</th>
                  <th>Block</th>
                  <th>Observed</th>
                  <th>Baseline</th>
                  <th>Severity</th>
                  <th>Window</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.map((alert) => {
                  const rowStyle =
                    alert.severity === 'High'
                      ? { background: '#fef2f2', color: '#991b1b' }
                      : alert.severity === 'Medium'
                      ? { background: '#fffbeb', color: '#92400e' }
                      : {};
                  return (
                    <tr key={alert._id} style={rowStyle}>
                      <td style={{ fontWeight: 700 }}>{alert.issueType}</td>
                      <td>{alert.apartmentBlock}</td>
                      <td>{alert.observedCount}</td>
                      <td>{alert.baselineCount}</td>
                      <td>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 700,
                            background: alert.severity === 'High' ? '#dc2626' : '#d97706',
                            color: '#fff'
                          }}
                        >
                          {alert.severity}
                        </span>
                      </td>
                      <td>{new Date(alert.windowStart).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                      <td>
                        <button
                          onClick={() => handleResolveAnomaly(alert._id)}
                          style={{
                            padding: '4px 12px',
                            borderRadius: 6,
                            border: '1px solid #d1d5db',
                            background: '#fff',
                            cursor: 'pointer',
                            fontSize: 13
                          }}
                        >
                          Resolve
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Avg Predicted vs Actual Resolution ── */}
      <div className="analytics-chart-card">
        <h3 className="analytics-chart-title">Avg Predicted vs Actual Resolution (hours) by Issue Type</h3>
        {resolutionAccuracy.length === 0 ? (
          <p className="muted">No resolution accuracy data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={resolutionAccuracy} margin={{ top: 5, right: 20, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="issueType" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 12 }} unit="h" />
              <Tooltip formatter={(val) => `${val}h`} />
              <Legend />
              <Bar dataKey="avgPredicted" name="Avg Predicted" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="avgActual" name="Avg Actual" fill="#16a34a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Sentiment Distribution ── */}
      <div className="analytics-chart-card">
        <h3 className="analytics-chart-title">Feedback Sentiment Distribution</h3>
        {sentimentDist.length === 0 ? (
          <p className="muted">No sentiment data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={sentimentDist}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {sentimentDist.map((entry) => (
                  <Cell key={entry.name} fill={SENTIMENT_COLORS[entry.name] || '#94a3b8'} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
