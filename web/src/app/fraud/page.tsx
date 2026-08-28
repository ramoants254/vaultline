'use client';

import { useState, useEffect } from 'react';
import { fraudApi, FraudAlert } from '@/lib/api';
import { formatDate, timeAgo, truncate } from '@/lib/utils';

export default function FraudPage() {
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fraudApi.getAlerts()
      .then(r => setAlerts(r.alerts))
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'ALL' ? alerts : alerts.filter(a => a.severity === filter);

  const counts = {
    HIGH:   alerts.filter(a => a.severity === 'HIGH').length,
    MEDIUM: alerts.filter(a => a.severity === 'MEDIUM').length,
    LOW:    alerts.filter(a => a.severity === 'LOW').length,
  };

  return (
    <div>
      <div className="page-header animate-fadeInUp">
        <h1>⚑ Fraud Alerts</h1>
        <p>Real-time fraud detection alerts from the rules engine</p>
      </div>

      {/* Summary cards */}
      <div className="grid-3" style={{ marginBottom: 28 }}>
        <SummaryCard label="High Severity" count={counts.HIGH} color="var(--danger)" dim="var(--danger-dim)" />
        <SummaryCard label="Medium Severity" count={counts.MEDIUM} color="var(--warning)" dim="var(--warning-dim)" />
        <SummaryCard label="Low Severity" count={counts.LOW} color="var(--info)" dim="var(--info-dim)" />
      </div>

      {/* Filter tabs */}
      <div className="tabs animate-fadeInUp stagger-1">
        {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(f => (
          <button
            key={f}
            id={`fraud-filter-${f.toLowerCase()}`}
            className={`tab-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f} {f !== 'ALL' && <span style={{ opacity: 0.7, fontSize: '0.7rem' }}>({counts[f] ?? 0})</span>}
          </button>
        ))}
      </div>

      {/* Alerts table */}
      <div className="glass-card animate-fadeInUp stagger-2">
        {loading ? (
          <div className="empty-state">
            <div className="spinner" style={{ width: 32, height: 32 }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">✅</div>
            <div className="empty-title">No {filter !== 'ALL' ? filter.toLowerCase() + ' ' : ''}alerts</div>
            <div className="empty-sub">Your transactions are clean.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Rule Triggered</th>
                  <th>Reference ID</th>
                  <th>Detected</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(alert => (
                  <>
                    <tr key={alert.id}>
                      <td><SeverityBadge severity={alert.severity} /></td>
                      <td style={{ fontWeight: 600 }}>{alert.rule_triggered}</td>
                      <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {truncate(alert.reference_id, 20)}
                      </td>
                      <td>
                        <div style={{ fontSize: '0.875rem' }}>{timeAgo(alert.created_at)}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatDate(alert.created_at)}</div>
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setExpanded(expanded === alert.id ? null : alert.id)}
                        >
                          {expanded === alert.id ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </tr>
                    {expanded === alert.id && (
                      <tr key={`${alert.id}-detail`}>
                        <td colSpan={5}>
                          <div className="payload-viewer">
                            {JSON.stringify(alert.details, null, 2)}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, count, color, dim }: { label: string; count: number; color: string; dim: string }) {
  return (
    <div className="glass-card stat-card animate-fadeInUp" style={{ background: dim, borderColor: `${color}30` }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{count}</div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = { HIGH: 'badge-danger', MEDIUM: 'badge-warning', LOW: 'badge-info' };
  return <span className={`badge ${map[severity] ?? 'badge-muted'}`}>{severity}</span>;
}
