'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bookmark,
  Menu,
  Search,
  Wallet,
  X,
} from 'lucide-react';
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
      <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto max-w-screen-2xl h-full px-4 flex items-center gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-cyan flex items-center justify-center shadow-glow-sm">
              <Wallet className="w-4 h-4 text-background" />
            </div>
            <span className="font-bold text-lg gradient-text hidden sm:block">Wallet Intel</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 ml-4">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
                  pathname === href
                    ? 'bg-accent/10 text-accent'
                    : 'text-text-2 hover:text-text hover:bg-surface-2'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border border-border rounded-lg text-text-3 text-sm hover:border-accent/40 transition-all duration-200 w-48 md:w-64 lg:w-80"
          >
            <Search className="w-4 h-4 shrink-0" />
            <span className="hidden sm:block truncate">Search Solana wallet...</span>
            <kbd className="ml-auto hidden lg:flex items-center gap-1 text-xs text-text-3 bg-surface border border-border rounded px-1.5 py-0.5">
              ⌘K
            </kbd>
          </button>

          {/* Mobile menu */}
          <button
            className="md:hidden btn-ghost p-2"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile nav */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-16 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-b border-border p-4 flex flex-col gap-2 md:hidden"
          >
            {NAV_LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                  pathname === href
                    ? 'bg-accent/10 text-accent border border-accent/20'
                    : 'text-text-2 hover:text-text hover:bg-surface-2'
                )}
              >
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global wallet search modal */}
      <AnimatePresence>
        {searchOpen && (
          <WalletSearch onClose={() => setSearchOpen(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
