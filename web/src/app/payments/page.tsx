'use client';

import { useState, FormEvent } from 'react';
import { paymentsApi } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/hooks/useAuth';
// Using native crypto.randomUUID() for idempotency keys

type Tab = 'deposit' | 'transfer';

export default function PaymentsPage() {
  const [tab, setTab] = useState<Tab>('deposit');

  return (
    <div>
      <div className="page-header animate-fadeInUp">
        <h1>Payments</h1>
        <p>Deposit funds or transfer between accounts</p>
      </div>

      <div className="tabs animate-fadeInUp stagger-1">
        <button id="tab-deposit"  className={`tab-btn ${tab === 'deposit'  ? 'active' : ''}`} onClick={() => setTab('deposit')}>Deposit</button>
        <button id="tab-transfer" className={`tab-btn ${tab === 'transfer' ? 'active' : ''}`} onClick={() => setTab('transfer')}>Transfer</button>
      </div>

      {tab === 'deposit'  && <DepositForm />}
      {tab === 'transfer' && <TransferForm />}
    </div>
  );
}

// ─── Deposit Form ─────────────────────────────────────────────────
function DepositForm() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [form, setForm] = useState({
    amount: '',
    currency: 'USD',
    paymentMethodToken: 'tok_visa_test',
    clearingAccountId: '',
    userWalletAccountId: '',
  });
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) {
      toast('error', 'Invalid amount', 'Please enter a positive number.');
      return;
    }
    setLoading(true);
    const key = crypto.randomUUID();
    try {
      const res = await paymentsApi.deposit({
        userId: user!.id,
        amount: Number(form.amount),
        currency: form.currency,
        paymentMethodToken: form.paymentMethodToken,
        clearingAccountId: form.clearingAccountId,
        userWalletAccountId: form.userWalletAccountId,
      }, key);
      toast('success', 'Deposit submitted', `Payment ID: ${res.paymentId}`);
      setLastResult(res as unknown as Record<string, unknown>);
    } catch (err: unknown) {
      toast('error', 'Deposit failed', err instanceof Error ? err.message : 'Unknown error');
    }
    setLoading(false);
  };

  return (
    <div className="grid-2" style={{ gap: 24, alignItems: 'start' }}>
      <div className="glass-card form-card animate-fadeInUp stagger-2">
        <h3>Deposit Funds</h3>
        <form className="form-grid" onSubmit={handleSubmit} noValidate>
          <Field id="dep-amount"   label="Amount"              type="number"  value={form.amount}               onChange={set('amount')}               placeholder="0.00" />
          <Field id="dep-currency" label="Currency"            type="text"    value={form.currency}              onChange={set('currency')}              placeholder="USD" maxLength={3} />
          <Field id="dep-token"    label="Payment Method Token" type="text"   value={form.paymentMethodToken}    onChange={set('paymentMethodToken')}    placeholder="tok_visa_test" />
          <Field id="dep-clearing" label="Clearing Account ID" type="text"    value={form.clearingAccountId}     onChange={set('clearingAccountId')}     placeholder="UUID of clearing account" />
          <Field id="dep-wallet"   label="Wallet Account ID"   type="text"    value={form.userWalletAccountId}   onChange={set('userWalletAccountId')}   placeholder="UUID of your wallet account" />

          <div className="form-actions">
            <button id="deposit-submit" type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Processing…</> : '⇩ Deposit'}
            </button>
          </div>
        </form>
      </div>

      <div className="glass-card form-card animate-fadeInUp stagger-3">
        <h3>How Deposits Work</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
          <Step n={1} title="Payment Gateway" desc="Funds are charged via the external payment provider using your payment method token." />
          <Step n={2} title="Idempotency" desc="Each request uses a unique UUID key to prevent duplicate charges." />
          <Step n={3} title="Event Processing" desc="A payment.completed event is published to RabbitMQ and the ledger is updated automatically." />
          <Step n={4} title="Balance Update" desc="Your wallet account balance increases via a double-entry journal entry." />
        </div>
        {lastResult && (
          <div style={{ marginTop: 20 }}>
            <div className="section-title">Last Result</div>
            <div className="payload-viewer">{JSON.stringify(lastResult, null, 2)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Transfer Form ────────────────────────────────────────────────
function TransferForm() {
  const { toast } = useToast();
  const [form, setForm] = useState({
    senderWalletAccountId: '',
    recipientWalletAccountId: '',
    amount: '',
    currency: 'USD',
  });
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      toast('error', 'Invalid amount', 'Please enter a positive number.');
      return;
    }
    if (!form.senderWalletAccountId || !form.recipientWalletAccountId) {
      toast('error', 'Missing accounts', 'Both sender and recipient account IDs are required.');
      return;
    }
    setLoading(true);
    const key = crypto.randomUUID();
    try {
      const res = await paymentsApi.transfer({
        senderWalletAccountId: form.senderWalletAccountId,
        recipientWalletAccountId: form.recipientWalletAccountId,
        amount: Number(form.amount),
        currency: form.currency,
      }, key);
      toast('success', 'Transfer completed', `Transfer ID: ${res.paymentId}`);
      setLastResult(res as unknown as Record<string, unknown>);
    } catch (err: unknown) {
      toast('error', 'Transfer failed', err instanceof Error ? err.message : 'Unknown error');
    }
    setLoading(false);
  };

  return (
    <div className="grid-2" style={{ gap: 24, alignItems: 'start' }}>
      <div className="glass-card form-card animate-fadeInUp stagger-2">
        <h3>Transfer Between Accounts</h3>
        <form className="form-grid" onSubmit={handleSubmit} noValidate>
          <Field id="tr-sender"    label="Sender Wallet Account ID"    type="text"   value={form.senderWalletAccountId}    onChange={set('senderWalletAccountId')}    placeholder="UUID" />
          <Field id="tr-recipient" label="Recipient Wallet Account ID" type="text"   value={form.recipientWalletAccountId} onChange={set('recipientWalletAccountId')} placeholder="UUID" />
          <Field id="tr-amount"    label="Amount"                      type="number" value={form.amount}                   onChange={set('amount')}                   placeholder="0.00" />
          <Field id="tr-currency"  label="Currency"                    type="text"   value={form.currency}                 onChange={set('currency')}                 placeholder="USD" maxLength={3} />

          <div className="form-actions">
            <button id="transfer-submit" type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Processing…</> : '⇄ Transfer'}
            </button>
          </div>
        </form>
      </div>

      <div className="glass-card form-card animate-fadeInUp stagger-3">
        <h3>About Transfers</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
          <Step n={1} title="Peer-to-Peer" desc="Transfers move funds directly between two ledger wallet accounts." />
          <Step n={2} title="Double-Entry" desc="Ledger automatically debits sender and credits recipient to maintain accounting balance." />
          <Step n={3} title="Idempotent" desc="Re-sending the same idempotency key returns the original result without re-processing." />
        </div>
        {lastResult && (
          <div style={{ marginTop: 20 }}>
            <div className="section-title">Last Result</div>
            <div className="payload-viewer">{JSON.stringify(lastResult, null, 2)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  id, label, type, value, onChange, placeholder, maxLength
}: {
  id: string; label: string; type: string;
  value: string; onChange: React.ChangeEventHandler<HTMLInputElement>;
  placeholder: string; maxLength?: number;
}) {
  return (
    <div className="input-group">
      <label className="input-label" htmlFor={id}>{label}</label>
      <input id={id} type={type} className="input" value={value}
        onChange={onChange} placeholder={placeholder} maxLength={maxLength} />
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: 'var(--accent-dim)', border: '1px solid var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-light)',
        flexShrink: 0, marginTop: 2
      }}>{n}</div>
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{desc}</div>
      </div>
    </div>
  );
}
