'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';

export default function RegisterPage() {
  const { register } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = 'Full name is required';
    if (!form.email) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email';
    if (form.password.length < 8) e.password = 'Password must be at least 8 characters';
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match';
    return e;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);
    try {
      await register(form.email, form.password, form.fullName);
      toast('success', 'Account created!', 'Welcome to Vaultline.');
      router.push('/dashboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      toast('error', 'Registration failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const field = (id: string, label: string, type: string, key: string, placeholder: string, autocomplete?: string) => (
    <div className="input-group">
      <label className="input-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        className={`input ${errors[key] ? 'error' : ''}`}
        placeholder={placeholder}
        value={form[key as keyof typeof form]}
        onChange={set(key)}
        autoComplete={autocomplete}
      />
      {errors[key] && <span className="input-error">{errors[key]}</span>}
    </div>
  );

  return (
    <div className="auth-layout">
      <div className="glass-card auth-card animate-fadeInUp" style={{ maxWidth: 500 }}>
        <div className="auth-logo">
          <div className="auth-logo-mark">V</div>
          <span className="auth-logo-name">Vaultline</span>
        </div>

        <h1 className="auth-title" style={{ fontSize: '1.75rem' }}>Create account</h1>
        <p className="auth-subtitle">Start managing your finances securely</p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {field('reg-name',     'Full name',        'text',     'fullName', 'Jane Doe',         'name')}
          {field('reg-email',    'Email address',    'email',    'email',    'you@example.com',  'email')}
          {field('reg-password', 'Password',         'password', 'password', '••••••••',         'new-password')}
          {field('reg-confirm',  'Confirm password', 'password', 'confirm',  '••••••••',         'new-password')}

          <button
            id="register-submit"
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            disabled={loading}
            style={{ marginTop: 4 }}
          >
            {loading
              ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Creating account…</>
              : 'Create account'}
          </button>
        </form>

        <div className="auth-link-row" style={{ marginTop: 24 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Already have an account? </span>
          <Link href="/login" className="auth-link">Sign in →</Link>
        </div>
      </div>
    </div>
  );
}
