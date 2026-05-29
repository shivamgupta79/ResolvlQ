import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api.js';
import { getDuplicateGroups } from '../services/api.js';
import { useSocketEvent } from '../hooks/useSocket.js';

const STATUS_META = {
  Pending:      { icon: '⏳', color: '#d97706', bg: '#fef3c7' },
  Assigned:     { icon: '👷', color: '#2563eb', bg: '#dbeafe' },
  'In Progress':{ icon: '🔧', color: '#7c3aed', bg: '#ede9fe' },
  Scheduled:    { icon: '📅', color: '#0891b2', bg: '#e0f2fe' },
  Completed:    { icon: '✅', color: '#16a34a', bg: '#dcfce7' },
  Cancelled:    { icon: '🚫', color: '#dc2626', bg: '#fee2e2' },
};

function StarRating({ rating }) {
  return (
    <span>
      {[1,2,3,4,5].map((s) => (
        <span key={s} style={{ color: s <= rating ? '#f59e0b' : '#e2e8f0', fontSize: 18 }}>★</span>
      ))}
    </span>
  );
}

export default function ComplaintDetails() {
  const { id } = useParams();
  const [complaint, setComplaint]           = useState(null);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState('');
  const [duplicateGroupCount, setDuplicateGroupCount] = useState(null);

  const load = () => {
    api.get(`/complaints/${id}`)
      .then(({ data }) => {
        setComplaint(data);
        // Fetch duplicate group count if this complaint belongs to a group
        if (data.duplicateGroupId) {
          getDuplicateGroups()
            .then(({ data: groupData }) => {
              const group = groupData.groups?.find(
                (g) => g.duplicateGroupId === data.duplicateGroupId
              );
              if (group) setDuplicateGroupCount(group.complaintIds?.length ?? null);
            })
            .catch(() => {/* non-critical — silently ignore */});
        }
      })
      .catch(() => setError('Failed to load complaint'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  // Real-time update
  useSocketEvent('complaint:updated', (payload) => {
    if (payload._id === id) {
      setComplaint((prev) => prev ? { ...prev, ...payload } : prev);
    }
  });

  if (loading) return <p className="muted" style={{ textAlign: 'center', marginTop: 60 }}>Loading…</p>;
  if (error)   return <div className="auth-error"><span>⚠️</span> {error}</div>;
  if (!complaint) return null;

  const sm = STATUS_META[complaint.status] || {};

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      {/* Back */}
      <Link to="/dashboard" className="adm-icon-btn" style={{ marginBottom: 20, display: 'inline-flex' }}>
        ← Back to Dashboard
      </Link>

      {/* Header card */}
      <div className="adm-card" style={{ marginBottom: 20 }}>
        <div className="adm-card-top">
          <div>
            <h2 style={{ margin: 0 }}>{complaint.issueType}</h2>
            <p className="adm-card-meta">
              🏠 Apt {complaint.apartmentNo} &nbsp;·&nbsp; 👤 {complaint.residentName} &nbsp;·&nbsp; ✉️ {complaint.residentEmail}
            </p>
          </div>
          <span className="adm-status-pill" style={{ background: sm.bg, color: sm.color, border: `1px solid ${sm.color}33` }}>
            {sm.icon} {complaint.status}
          </span>
        </div>

        <div className="adm-card-info" style={{ marginTop: 12 }}>
          <span>📅 {complaint.preferredDate}</span>
          <span>🕐 {complaint.preferredTime}</span>
          <span>🎯 Priority: <b>{complaint.priority}</b></span>
          <span>👷 {complaint.assignedTechnician?.name ?? 'Unassigned'}</span>
          {/* Classification metadata */}
          {complaint.classificationSource === 'nlp' && complaint.classificationConfidence != null ? (
            <span title="Classified by NLP model">
              🤖 NLP ({Math.round(complaint.classificationConfidence * 100)}%)
            </span>
          ) : complaint.classificationSource === 'rule-based' ? (
            <span title="Classified by rule-based system">📋 Rule-based</span>
          ) : null}
          {complaint.emailSent && <span>📧 Email sent</span>}
          {complaint.calendarEventId && <span>📆 Scheduled</span>}
          {complaint.escalated && <span style={{ color: '#dc2626', fontWeight: 700 }}>🚨 Escalated</span>}
        </div>

        <p style={{ margin: '12px 0 0', fontSize: 15, lineHeight: 1.6 }}>{complaint.description}</p>

        {/* Predicted ETA panel */}
        {complaint.predictedETA && (
          <div style={{
            marginTop: 14,
            padding: '10px 14px',
            background: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: 10,
            fontSize: 14,
            color: '#0369a1',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}>
            ⏱️ <b>Estimated Resolution:</b>&nbsp;
            {new Date(complaint.predictedETA).toLocaleString()}
            {complaint.predictedResolutionHours != null && (
              <span style={{ color: '#0284c7' }}>
                &nbsp;(~{complaint.predictedResolutionHours}h)
              </span>
            )}
          </div>
        )}

        {/* Duplicate group link */}
        {complaint.duplicateGroupId && (
          <div style={{
            marginTop: 10,
            padding: '8px 14px',
            background: '#faf5ff',
            border: '1px solid #d8b4fe',
            borderRadius: 10,
            fontSize: 14,
            color: '#7c3aed',
          }}>
            🔗{' '}
            <Link
              to="/analytics"
              style={{ color: '#7c3aed', fontWeight: 600, textDecoration: 'underline' }}
            >
              Part of duplicate group
            </Link>
            {duplicateGroupCount != null
              ? ` — ${duplicateGroupCount} related complaint${duplicateGroupCount !== 1 ? 's' : ''}.`
              : ' — related complaints.'}
          </div>
        )}

        {/* Image */}
        {complaint.imageUrl && (
          <div style={{ marginTop: 16 }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Attached Photo
            </p>
            <img
              src={complaint.imageUrl}
              alt="Complaint"
              style={{ maxWidth: '100%', borderRadius: 14, border: '1px solid #e2e8f0', maxHeight: 320, objectFit: 'cover' }}
            />
          </div>
        )}
      </div>

      {/* Feedback */}
      {complaint.feedbackSubmitted && (
        <div className="adm-card" style={{ marginBottom: 20, background: '#fefce8', border: '1px solid #fde68a' }}>
          <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 14 }}>⭐ Resident Feedback</p>
          {complaint.feedbackRating && <StarRating rating={complaint.feedbackRating} />}
          <p style={{ margin: '8px 0 0', fontSize: 14, fontStyle: 'italic', color: '#78350f' }}>
            "{complaint.feedback}"
          </p>

          {/* Sentiment badge */}
          {complaint.sentimentLabel && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{
                padding: '4px 12px',
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 600,
                background:
                  complaint.sentimentLabel === 'Positive' ? '#dcfce7' :
                  complaint.sentimentLabel === 'Negative' ? '#fee2e2' : '#f1f5f9',
                color:
                  complaint.sentimentLabel === 'Positive' ? '#16a34a' :
                  complaint.sentimentLabel === 'Negative' ? '#dc2626' : '#475569',
                border:
                  complaint.sentimentLabel === 'Positive' ? '1px solid #86efac' :
                  complaint.sentimentLabel === 'Negative' ? '1px solid #fca5a5' : '1px solid #cbd5e1',
              }}>
                {complaint.sentimentLabel === 'Positive' ? '😊' :
                 complaint.sentimentLabel === 'Negative' ? '😞' : '😐'}{' '}
                {complaint.sentimentLabel}
                {complaint.sentimentConfidence != null && (
                  <span style={{ fontWeight: 400, marginLeft: 4 }}>
                    ({Math.round(complaint.sentimentConfidence * 100)}%)
                  </span>
                )}
              </span>

              {complaint.requiresFollowUp && (
                <span style={{
                  padding: '4px 12px',
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 600,
                  background: '#fff7ed',
                  color: '#c2410c',
                  border: '1px solid #fdba74',
                }}>
                  ⚠️ Follow-up flagged
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Audit log */}
      {complaint.auditLog?.length > 0 && (
        <div className="adm-card" style={{ marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>📋 Activity History</h3>
          <div className="audit-timeline">
            {[...complaint.auditLog].reverse().map((entry, i) => {
              const esm = STATUS_META[entry.status] || {};
              return (
                <div key={i} className="audit-entry">
                  <div className="audit-dot" style={{ background: esm.color || '#94a3b8' }}>
                    {esm.icon || '•'}
                  </div>
                  <div className="audit-content">
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <span className="adm-status-pill" style={{ background: esm.bg || '#f1f5f9', color: esm.color || '#475569', border: 'none', fontSize: 11 }}>
                        {entry.status}
                      </span>
                      <span style={{ fontSize: 12, color: '#64748b' }}>
                        by <b>{entry.changedByName}</b>
                        {entry.changedByRole && ` (${entry.changedByRole})`}
                      </span>
                    </div>
                    {entry.reason && (
                      <p style={{ margin: '4px 0 0', fontSize: 13, color: '#475569' }}>
                        {entry.reason}
                      </p>
                    )}
                    <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>
                      {new Date(entry.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Generated email */}
      {complaint.generatedEmail && (
        <div className="adm-card">
          <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>📧 Generated Maintenance Email</h3>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#0f172a', color: '#e2e8f0', padding: 18, borderRadius: 14, fontSize: 13, lineHeight: 1.6, overflow: 'auto' }}>
            {complaint.generatedEmail}
          </pre>
        </div>
      )}
    </div>
  );
}
