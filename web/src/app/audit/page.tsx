'use client';

import { useState, useEffect } from 'react';
import { fraudApi, AuditLog } from '@/lib/api';
import { formatDate, timeAgo, truncate } from '@/lib/utils';

const EVENT_COLORS: Record<string, string> = {
  'payment.completed': 'badge-success',
  'payment.failed':    'badge-danger',
  'fraud.alert':       'badge-warning',
  'account.created':   'badge-accent',
  'user.registered':   'badge-info',
};

function eventBadgeClass(type: string): string {
  for (const [key, cls] of Object.entries(EVENT_COLORS)) {
    if (type.includes(key.split('.')[0])) return cls;
  }
  return EVENT_COLORS[type] ?? 'badge-muted';
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fraudApi.getAuditLogs()
      .then(r => setLogs(r.logs))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = logs.filter(l =>
    !search ||
    l.event_type.toLowerCase().includes(search.toLowerCase()) ||
    l.aggregate_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header animate-fadeInUp">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1>≡ Audit Log</h1>
            <p>Immutable system event trail — {logs.length} entries</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="badge badge-accent" style={{ fontSize: '0.75rem' }}>Read-only</span>
            <span className="badge badge-muted">Last 50 events</span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="glass-card animate-fadeInUp stagger-1" style={{ padding: 20, marginBottom: 24 }}>
        <div className="input-group">
          <label className="input-label" htmlFor="audit-search">Search events</label>
          <input
            id="audit-search"
            className="input"
            placeholder="Filter by event type or aggregate ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Log entries */}
      <div className="glass-card animate-fadeInUp stagger-2">
        {loading ? (
          <div className="empty-state">
            <div className="spinner" style={{ width: 32, height: 32 }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <div className="empty-title">{search ? 'No matching events' : 'No audit logs yet'}</div>
            <div className="empty-sub">{search ? 'Try a different search term.' : 'Events will appear here as the system processes transactions.'}</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Event Type</th>
                  <th>Aggregate ID</th>
                  <th>Timestamp</th>
                  <th>Payload</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(log => (
                  <>
                    <tr key={log.id}>
                      <td>
                        <span className={`badge ${eventBadgeClass(log.event_type)}`}>
                          {log.event_type}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {truncate(log.aggregate_id, 24)}
                      </td>
                      <td>
                        <div style={{ fontSize: '0.875rem' }}>{timeAgo(log.created_at)}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatDate(log.created_at)}</div>
                      </td>
                      <td>
                        <button
                          id={`audit-expand-${log.id}`}
                          className="btn btn-ghost btn-sm"
                          onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                        >
                          {expanded === log.id ? '▲ Hide' : '▼ Show'}
                        </button>
                      </td>
                    </tr>
                    {expanded === log.id && (
                      <tr key={`${log.id}-payload`}>
                        <td colSpan={4}>
                          <div className="payload-viewer">
                            {JSON.stringify(log.payload, null, 2)}
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

      <div style={{ marginTop: 16, padding: '12px 0', textAlign: 'center' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          This log is immutable. Events cannot be modified or deleted. Showing the most recent 50 records.
        </p>
      </div>
    </div>
  );
}
