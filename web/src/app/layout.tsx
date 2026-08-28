import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/hooks/useAuth';
import { ToastProvider } from '@/hooks/useToast';
import ToastContainer from '@/components/ToastContainer';

export const metadata: Metadata = {
  title: { default: 'Vaultline', template: '%s | Vaultline' },
  description: 'Vaultline — Fintech banking dashboard for ledger, payments, and fraud management.',
  keywords: ['fintech', 'banking', 'ledger', 'payments', 'vaultline'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <ToastProvider>
            {children}
            <ToastContainer />
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
