'use client';

import { useToast } from '@/hooks/useToast';

const ICONS: Record<string, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
};

export default function ToastContainer() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`} onClick={() => dismiss(t.id)}>
          <span className="toast-icon">
            {t.type === 'success' && <span style={{ color: 'var(--success)' }}>✓</span>}
            {t.type === 'error'   && <span style={{ color: 'var(--danger)' }}>✕</span>}
            {t.type === 'info'    && <span style={{ color: 'var(--accent)' }}>ℹ</span>}
          </span>
          <div className="toast-body">
            <div className="toast-title">{t.title}</div>
            {t.message && <div className="toast-message">{t.message}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
