'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bookmark, Menu, Search, X } from 'lucide-react';
import { WalletSearch } from '@/components/WalletSearch';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/', label: 'Analyze', icon: Search },
  { href: '/watchlist', label: 'Watchlist', icon: Bookmark },
];

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <>
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/8 bg-background/70 backdrop-blur-xl">
        <div className="page-shell flex h-20 items-center gap-4">
          <Link href="/" className="group flex items-center gap-3 shrink-0">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-glow-sm transition-all duration-200 group-hover:border-accent/30 group-hover:shadow-glow">
              <Image
                src="/branding/x-logo.svg"
                alt="Wallet Intel logo"
                width={28}
                height={28}
                className="h-7 w-7 rounded-lg"
                priority
              />
            </div>
            <div className="hidden sm:block">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-text-3">Wallet Intel</p>
              <p className="text-sm font-semibold text-text">Crypto Intelligence Dashboard</p>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1 rounded-full border border-white/8 bg-white/[0.03] p-1">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200',
                  pathname === href
                    ? 'bg-accent/10 text-accent shadow-glow-sm'
                    : 'text-text-2 hover:bg-white/5 hover:text-text'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex-1" />

          <button
            onClick={() => setSearchOpen(true)}
            className="flex w-full max-w-[22rem] items-center gap-3 rounded-full border border-white/10 bg-surface/70 px-4 py-3 text-left text-sm text-text-3 transition-all duration-200 hover:border-accent/35 hover:bg-surface sm:max-w-[26rem]"
          >
            <Search className="h-4 w-4 shrink-0 text-text-2" />
            <span className="hidden truncate sm:block">Search Solana wallet...</span>
            <span className="truncate sm:hidden">Search wallet...</span>
            <kbd className="ml-auto hidden rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-text-3 lg:flex">
              ⌘K
            </kbd>
          </button>

          <button
            className="md:hidden btn-ghost rounded-full border border-white/10 bg-white/5 p-2.5"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed left-0 right-0 top-20 z-40 border-b border-white/8 bg-background/90 px-4 pb-4 pt-2 backdrop-blur-xl md:hidden"
          >
            <div className="page-shell flex flex-col gap-2">
              {NAV_LINKS.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition-all duration-200',
                    pathname === href
                      ? 'border-accent/20 bg-accent/10 text-accent'
                      : 'border-white/8 bg-white/[0.03] text-text-2 hover:border-white/12 hover:bg-white/[0.05] hover:text-text'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{searchOpen && <WalletSearch onClose={() => setSearchOpen(false)} />}</AnimatePresence>
    </>
  );
}
