'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { ledgerApi, fraudApi, LedgerAccount, FraudAlert, LedgerEntry } from '@/lib/api';
import { formatCurrency, formatDate, timeAgo, initials } from '@/lib/utils';
import Link from 'next/link';

export default function DashboardPage() {
  const { user } = useAuth();
  const [accountId, setAccountId] = useState('');
  const [account, setAccount] = useState<LedgerAccount | null>(null);
  const [history, setHistory] = useState<LedgerEntry[]>([]);
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('vaultline_account_id');
    if (stored) {
      setAccountId(stored);
      fetchAccountData(stored);
    }
    loadAlerts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchAccountData(id: string) {
    if (!id) return;
    setLoadingAccount(true);
    try {
      const [bal, hist] = await Promise.all([
        ledgerApi.getBalance(id),
        ledgerApi.getHistory(id),
      ]);
      setAccount(bal);
      setHistory(hist.slice(0, 5));
      setFetched(true);
    } catch { /* ignore */ }
    setLoadingAccount(false);
  }

  async function loadAlerts() {
    try {
      const res = await fraudApi.getAlerts();
      setAlerts(res.alerts.slice(0, 3));
    } catch { /* ignore */ }
  }

  const handleAccountIdSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId.trim()) return;
    localStorage.setItem('vaultline_account_id', accountId.trim());
    fetchAccountData(accountId.trim());
  };

  const highAlerts = alerts.filter(a => a.severity === 'HIGH').length;

  return (
    <div>
      <div className="page-header animate-fadeInUp">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="user-avatar" style={{ width: 48, height: 48, fontSize: '1rem' }}>
            {user ? initials(user.full_name) : '?'}
          </div>
          <div>
            <h1>Good {greeting()}, {user?.full_name.split(' ')[0]} 👋</h1>
            <p>Here&apos;s your financial overview for today</p>
          </div>
        </div>
      </div>

      {/* Stat Grid */}
      <div className="grid-4" style={{ marginBottom: 32 }}>
        <div className="glass-card stat-card accent animate-fadeInUp stagger-1">
          <div className="stat-label">Wallet Balance</div>
          <div className="stat-value" style={{ color: 'var(--accent-light)' }}>
            {loadingAccount
              ? <span className="skeleton" style={{ display: 'inline-block', width: 120, height: 32 }} />
              : account
                ? formatCurrency(account.balance, account.currency)
                : '—'}
          </div>
          <div className="stat-sub">{account?.currency ?? 'No account linked'}</div>
        </div>

        <div className="glass-card stat-card success animate-fadeInUp stagger-2">
          <div className="stat-label">Transactions</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{history.length}</div>
          <div className="stat-sub">Recent entries</div>
        </div>

        <div className="glass-card stat-card warning animate-fadeInUp stagger-3">
          <div className="stat-label">Fraud Alerts</div>
          <div className="stat-value" style={{ color: 'var(--warning)' }}>{alerts.length}</div>
          <div className="stat-sub">{highAlerts > 0 ? `${highAlerts} HIGH severity` : 'No high-severity'}</div>
        </div>

        <div className="glass-card stat-card animate-fadeInUp stagger-4" style={{ background: 'var(--bg-card)' }}>
          <div className="stat-label">Account Status</div>
          <div className="stat-value" style={{ fontSize: '1.25rem', color: 'var(--success)' }}>
            {account ? '● Active' : '● Not linked'}
          </div>
          <div className="stat-sub">{account ? `#${account.account_number}` : 'Link account below'}</div>
        </div>
      </div>

      <div className="grid-2" style={{ gap: 24, alignItems: 'start' }}>
        {/* Account linker / info */}
        <div className="glass-card form-card animate-fadeInUp stagger-2">
          <h3>
            {account ? 'Linked Account' : 'Link Ledger Account'}
          </h3>
          {account ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
              <Row label="Account Number" value={account.account_number} />
              <Row label="Type"           value={account.type} />
              <Row label="Currency"       value={account.currency} />
              <Row label="Balance"        value={formatCurrency(account.balance, account.currency)} highlight />
              <Row label="Created"        value={formatDate(account.created_at)} />
              <button
                className="btn btn-ghost btn-sm"
                style={{ alignSelf: 'flex-start', marginTop: 8 }}
                onClick={() => { setAccount(null); setFetched(false); localStorage.removeItem('vaultline_account_id'); }}
              >
                Unlink account
              </button>
            </div>
          ) : (
            <form onSubmit={handleAccountIdSubmit} style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: '0.875rem' }}>
                Enter your ledger account UUID to view balances and history.
              </p>
              <div className="input-group">
                <label className="input-label" htmlFor="account-id-input">Account ID (UUID)</label>
                <input
                  id="account-id-input"
                  className="input"
                  placeholder="e.g. 3f8a92b1-…"
                  value={accountId}
                  onChange={e => setAccountId(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary btn-sm" disabled={loadingAccount}>
                {loadingAccount ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Loading…</> : 'Link Account'}
              </button>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                No account yet? Go to{' '}
                <Link href="/ledger" style={{ color: 'var(--accent-light)' }}>Ledger</Link> to create one.
              </p>
            </form>
          )}
        </div>

        {/* Recent activity */}
        <div className="glass-card animate-fadeInUp stagger-3" style={{ padding: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3>Recent Activity</h3>
            <Link href="/ledger" className="btn btn-ghost btn-sm">View all →</Link>
          </div>
          {fetched && history.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <div className="empty-title">No transactions yet</div>
            </div>
          )}
          {!fetched && (
            <div className="empty-state">
              <div className="empty-icon">🔗</div>
              <div className="empty-title">Link an account to see activity</div>
            </div>
          )}
          {history.map((entry) => (
            <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: entry.direction === 'CREDIT' ? 'var(--success-dim)' : 'var(--danger-dim)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14,
                }}>
                  {entry.direction === 'CREDIT' ? '↑' : '↓'}
                </div>
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{entry.description || 'Transaction'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{timeAgo(entry.created_at)}</div>
                </div>
              </div>
              <div style={{
                fontWeight: 700, fontSize: '0.9375rem',
                color: entry.direction === 'CREDIT' ? 'var(--success)' : 'var(--danger)',
              }}>
                {entry.direction === 'CREDIT' ? '+' : '-'}{formatCurrency(entry.amount)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fraud summary */}
      {alerts.length > 0 && (
        <div className="glass-card animate-fadeInUp" style={{ padding: 28, marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3>⚑ Fraud Alerts</h3>
            <Link href="/fraud" className="btn btn-ghost btn-sm">View all →</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {alerts.map(alert => (
              <div key={alert.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{alert.rule_triggered}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{timeAgo(alert.created_at)}</div>
                </div>
                <SeverityBadge severity={alert.severity} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: '0.875rem', fontWeight: highlight ? 700 : 500, color: highlight ? 'var(--accent-light)' : 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const cls = severity === 'HIGH' ? 'badge-danger' : severity === 'MEDIUM' ? 'badge-warning' : 'badge-info';
  return <span className={`badge ${cls}`}>{severity}</span>;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
