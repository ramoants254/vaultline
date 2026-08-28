'use client';

import { useState, useEffect, FormEvent } from 'react';
import { ledgerApi, LedgerAccount, LedgerEntry } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/hooks/useAuth';

export default function LedgerPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [accountId, setAccountId] = useState('');
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [account, setAccount] = useState<LedgerAccount | null>(null);
  const [history, setHistory] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Create account form
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    type: 'ASSET',
    currency: 'USD',
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      if (user?.id) await loadAccounts();
      const stored = localStorage.getItem('vaultline_account_id');
      if (stored) { setAccountId(stored); fetchAccount(stored); }
    };
    initialize();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function loadAccounts() {
    try {
      const userAccounts = await ledgerApi.getAccounts();
      setAccounts(userAccounts);
    } catch { /* ignore */ }
  }

  async function fetchAccount(id: string) {
    if (!id.trim()) return;
    setLoading(true);
    try {
      const [bal, hist] = await Promise.all([
        ledgerApi.getBalance(id),
        ledgerApi.getHistory(id),
      ]);
      setAccount(bal);
      setHistory(hist);
      localStorage.setItem('vaultline_account_id', id);
    } catch (err: unknown) {
      toast('error', 'Failed to load account', err instanceof Error ? err.message : '');
    }
    setLoading(false);
  }

  const handleLookup = (e: FormEvent) => {
    e.preventDefault();
    fetchAccount(accountId);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const acc = await ledgerApi.createAccount({
        userId: user?.id,
        ...createForm,
      });
      toast('success', 'Account created', `Account #${acc.account_number}`);
      setShowCreate(false);
      setAccountId(acc.id);
      setAccounts(previous => [acc, ...previous]);
      fetchAccount(acc.id);
    } catch (err: unknown) {
      toast('error', 'Failed to create account', err instanceof Error ? err.message : '');
    }
    setCreating(false);
  };

  return (
    <div>
      <div className="page-header animate-fadeInUp">
        <h1>Ledger</h1>
        <p>View account balance and double-entry transaction history</p>
      </div>

      {/* Controls */}
      <div className="glass-card form-card animate-fadeInUp stagger-1" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <form onSubmit={handleLookup} style={{ display: 'flex', gap: 10, flex: 1, minWidth: 260 }}>
            <div className="input-group" style={{ flex: 1 }}>
              <label className="input-label" htmlFor="ledger-account-id">Account ID</label>
              <input
                id="ledger-account-id"
                className="input"
                placeholder="UUID of your ledger account"
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-end' }} disabled={loading}>
              {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Load'}
            </button>
          </form>
          {accounts.length > 0 && (
            <select
              className="input"
              aria-label="Your ledger accounts"
              value={accountId}
              onChange={e => { setAccountId(e.target.value); fetchAccount(e.target.value); }}
              style={{ maxWidth: 260 }}
            >
              {accounts.map(accountOption => (
                <option key={accountOption.id} value={accountOption.id}>
                  {accountOption.account_number} · {accountOption.type}
                </option>
              ))}
            </select>
          )}
          <button className="btn btn-secondary" onClick={() => setShowCreate(v => !v)}>
            {showCreate ? 'Cancel' : '+ New Account'}
          </button>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} style={{ marginTop: 24, display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            <div className="input-group">
              <label className="input-label" htmlFor="acc-type">Account Type</label>
              <select id="acc-type" className="input"
                value={createForm.type}
                onChange={e => setCreateForm(f => ({ ...f, type: e.target.value }))}
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
                {['ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="acc-currency">Currency</label>
              <input id="acc-currency" className="input" value={createForm.currency}
                onChange={e => setCreateForm(f => ({ ...f, currency: e.target.value.toUpperCase() }))} maxLength={3} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="submit" className="btn btn-primary btn-full" disabled={creating}>
                {creating ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Creating…</> : 'Create Account'}
              </button>
            </div>
          </form>
        )}
      </div>

      {account && (
        <>
          {/* Balance hero */}
          <div className="balance-hero animate-fadeInUp stagger-2">
            <div className="balance-label">Account Balance</div>
            <div className="balance-amount">
              <span className="balance-currency">{account.currency}</span>
              {parseFloat(account.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="balance-meta">
              <div className="balance-meta-item">
                <div className="balance-meta-label">Account Number</div>
                <div className="balance-meta-value">{account.account_number}</div>
              </div>
              <div className="balance-meta-item">
                <div className="balance-meta-label">Type</div>
                <div className="balance-meta-value">{account.type}</div>
              </div>
              <div className="balance-meta-item">
                <div className="balance-meta-label">Opened</div>
                <div className="balance-meta-value">{formatDate(account.created_at, { year: 'numeric', month: 'short', day: 'numeric' })}</div>
              </div>
            </div>
          </div>

          {/* History table */}
          <div className="glass-card animate-fadeInUp stagger-3">
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <h3>Transaction History</h3>
            </div>
            {history.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <div className="empty-title">No transactions yet</div>
                <div className="empty-sub">Transactions will appear here once deposits or transfers are made.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Reference</th>
                      <th>Description</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          <span className={`badge ${entry.direction === 'CREDIT' ? 'badge-success' : 'badge-danger'}`}>
                            {entry.direction === 'CREDIT' ? '↑ CREDIT' : '↓ DEBIT'}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, color: entry.direction === 'CREDIT' ? 'var(--success)' : 'var(--danger)' }}>
                          {entry.direction === 'CREDIT' ? '+' : '-'}{formatCurrency(entry.amount)}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {entry.reference_id?.slice(0, 16)}…
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>{entry.description || '—'}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                          {formatDate(entry.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
