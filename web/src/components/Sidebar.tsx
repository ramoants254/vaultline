'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { initials } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard', icon: '⬡', label: 'Overview' },
  { href: '/ledger',    icon: '⊞', label: 'Ledger' },
  { href: '/payments',  icon: '⇄', label: 'Payments' },
  { href: '/fraud',     icon: '⚑', label: 'Fraud Alerts' },
  { href: '/audit',     icon: '≡', label: 'Audit Log' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-mark">V</div>
        <span className="logo-text">Vaultline</span>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Main</div>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${active ? 'active' : ''}`}
            >
              <span className="nav-icon" aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        {user && (
          <div className="user-chip">
            <div className="user-avatar">{initials(user.full_name)}</div>
            <div className="user-info">
              <div className="user-name">{user.full_name}</div>
              <div className="user-email">{user.email}</div>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className="nav-item btn-ghost"
          style={{ marginTop: 8, color: 'var(--danger)', width: '100%' }}
        >
          <span className="nav-icon">⏻</span>
          Sign out
        </button>
      </div>
    </aside>
  );
}
