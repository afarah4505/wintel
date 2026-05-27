import type { Metadata } from 'next';
import type { Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';
import { Navbar } from '@/components/layout/Navbar';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'Wallet Intel — Solana Wallet Analyzer',
  description:
    'Analyze any Solana wallet with balance, age, holdings, estimated PnL, win rate, and recent transactions.',
  keywords: ['solana', 'wallet analyzer', 'wallet intelligence', 'wallet tracking', 'crypto'],
  openGraph: {
    title: 'Wallet Intel — Solana Wallet Analyzer',
    description: 'Analyze any Solana wallet in seconds and save wallets to your watchlist.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-text antialiased">
        <Providers>
          <Navbar />
          <main className="pt-16">{children}</main>
        </Providers>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#111827',
              color: '#F9FAFB',
              border: '1px solid #1F2937',
              borderRadius: '12px',
              fontSize: '14px',
            },
            success: {
              iconTheme: { primary: '#00FFA3', secondary: '#080B14' },
            },
            error: {
              iconTheme: { primary: '#FF4444', secondary: '#080B14' },
            },
          }}
        />
      </body>
    </html>
  );
}
