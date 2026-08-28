const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:8000';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('vaultline_token');
}

export function setToken(token: string) {
  localStorage.setItem('vaultline_token', token);
}

export function clearToken() {
  localStorage.removeItem('vaultline_token');
  localStorage.removeItem('vaultline_user');
}

type FetchOptions = RequestInit & { skipAuth?: boolean };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { skipAuth, ...rest } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(rest.headers as Record<string, string> || {}),
  };

  if (!skipAuth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${GATEWAY}${path}`, { ...rest, headers });

  if (res.status === 401) {
    clearToken();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new ApiError(401, 'Unauthorized');
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body.message || body.error || message;
    } catch { /* ignore */ }
    throw new ApiError(res.status, message);
  }

  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    apiFetch<{ accessToken: string; refreshToken: string; user: User }>(
      '/api/v1/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }), skipAuth: true }
    ),
  register: (email: string, password: string, fullName: string) =>
    apiFetch<{ user: User }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName }),
      skipAuth: true,
    }),
  logout: (refreshToken: string) =>
    apiFetch<void>('/api/v1/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),
  me: () => apiFetch<User>('/api/v1/auth/me'),
};

// ─── Ledger ───────────────────────────────────────────────────────
export const ledgerApi = {
  getAccounts: () => apiFetch<LedgerAccount[]>('/api/v1/ledger/accounts'),
  createAccount: (data: CreateAccountPayload) =>
    apiFetch<LedgerAccount>('/api/v1/ledger/accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getBalance: (accountId: string) =>
    apiFetch<LedgerAccount>(`/api/v1/ledger/accounts/${accountId}/balance`),
  getHistory: (accountId: string) =>
    apiFetch<LedgerEntry[]>(`/api/v1/ledger/accounts/${accountId}/history`),
};

// ─── Payments ─────────────────────────────────────────────────────
export const paymentsApi = {
  deposit: (data: DepositPayload, idempotencyKey: string) =>
    apiFetch<PaymentResult>('/api/v1/payments/deposit', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': idempotencyKey },
      body: JSON.stringify(data),
    }),
  transfer: (data: TransferPayload, idempotencyKey: string) =>
    apiFetch<PaymentResult>('/api/v1/payments/transfer', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': idempotencyKey },
      body: JSON.stringify(data),
    }),
};

// ─── Fraud & Audit ────────────────────────────────────────────────
export const fraudApi = {
  getAlerts: () => apiFetch<{ count: number; alerts: FraudAlert[] }>('/api/v1/fraud/fraud-alerts'),
  getAuditLogs: () => apiFetch<{ count: number; logs: AuditLog[] }>('/api/v1/fraud/audit-logs'),
};

// ─── Types ────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  full_name: string;
  kyc_document_url: string | null;
  created_at: string;
}

export interface LedgerAccount {
  id: string;
  user_id: string;
  account_number: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  currency: string;
  balance: string;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: string;
  created_at: string;
  reference_id: string;
  description: string;
}

export interface PaymentResult {
  status: 'COMPLETED' | 'FAILED';
  paymentId: string;
  referenceId: string;
  amount: number;
  currency?: string;
  error?: string;
}

export interface FraudAlert {
  id: string;
  reference_id: string;
  rule_triggered: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  details: Record<string, unknown>;
  created_at: string;
}

export interface AuditLog {
  id: string;
  event_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface CreateAccountPayload {
  userId?: string;
  type: string;
  currency: string;
}

export interface DepositPayload {
  userId: string;
  amount: number;
  currency: string;
  paymentMethodToken: string;
  clearingAccountId: string;
  userWalletAccountId: string;
}

export interface TransferPayload {
  senderWalletAccountId: string;
  recipientWalletAccountId: string;
  amount: number;
  currency: string;
}
