import type { Metadata } from 'next';
import type { Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';
import { Navbar } from '@/components/layout/Navbar';
import { Toaster } from 'react-hot-toast';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.URL || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Wallet Intel — Crypto Intelligence Dashboard',
  description:
    'A premium Solana wallet intelligence dashboard with behavioral insights, portfolio context, and lightweight analytics.',
  keywords: ['solana', 'wallet analyzer', 'wallet intelligence', 'wallet tracking', 'crypto'],
  icons: {
    icon: '/branding/x-logo.svg',
    shortcut: '/branding/x-logo.svg',
    apple: '/branding/x-logo.svg',
  },
  openGraph: {
    title: 'Wallet Intel — Crypto Intelligence Dashboard',
    description: 'Analyze Solana wallets with a sleek premium intelligence dashboard.',
    type: 'website',
    images: ['/branding/x-banner.svg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Wallet Intel — Crypto Intelligence Dashboard',
    description: 'Analyze Solana wallets with a sleek premium intelligence dashboard.',
    images: ['/branding/x-banner.svg'],
  },
};

export const viewport: Viewport = {
  themeColor: '#05070d',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" data-scroll-behavior="smooth">
      <body className="min-h-screen bg-background text-text antialiased selection:bg-accent/30 selection:text-white">
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="orb hero-orb-cyan -top-48 left-[-8rem] h-[28rem] w-[28rem]" />
          <div className="orb hero-orb-purple top-28 right-[-7rem] h-[26rem] w-[26rem]" />
          <div className="orb hero-orb-green bottom-0 left-1/2 h-[24rem] w-[24rem] -translate-x-1/2" />
        </div>
        <Providers>
          <Navbar />
          <main className="relative pt-20">{children}</main>
        </Providers>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'rgba(13, 17, 23, 0.9)',
              color: '#F9FAFB',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '16px',
              fontSize: '14px',
              backdropFilter: 'blur(18px)',
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
