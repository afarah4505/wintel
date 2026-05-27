'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bookmark, Edit3, ExternalLink, Search, Trash2, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAppStore } from '@/store/appStore';
import { shortenAddress, isValidSolanaAddress } from '@/lib/utils';
import {
  fetchRemoteWatchlist,
  getClientId,
  renameRemoteWallet,
  trackRemoteWallet,
  untrackRemoteWallet,
} from '@/lib/watchlist';

export default function WatchlistPage() {
  const { watchlist, removeFromWatchlist, updateWatchlistLabel, addToWatchlist, replaceWatchlist } = useAppStore();
  const [newAddress, setNewAddress] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [error, setError] = useState('');
  const [isLoadingRemote, setIsLoadingRemote] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const clientId = getClientId();
        const remote = await fetchRemoteWatchlist(clientId);
        if (!remote) return;
        replaceWatchlist(remote);
      } finally {
        setIsLoadingRemote(false);
      }
    };

    load();
  }, [replaceWatchlist]);

  const handleAdd = async () => {
    if (isSaving) return;
    const trimmed = newAddress.trim();
    if (!isValidSolanaAddress(trimmed)) { setError('Invalid Solana address'); return; }

    setIsSaving(true);
    const clientId = getClientId();
    try {
      addToWatchlist(trimmed);
      setNewAddress('');
      toast.success('Added to watchlist');

      const ok = await trackRemoteWallet(clientId, trimmed);
      if (!ok) toast('Saved locally. Supabase sync unavailable.', { icon: 'ℹ️' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async (address: string) => {
    if (isSaving) return;
    setIsSaving(true);
    const clientId = getClientId();
    try {
      removeFromWatchlist(address);
      toast.success('Removed from watchlist');

      const ok = await untrackRemoteWallet(clientId, address);
      if (!ok) toast('Saved locally. Supabase sync unavailable.', { icon: 'ℹ️' });
    } finally {
      setIsSaving(false);
    }
  };

  const saveLabel = async (address: string) => {
    if (isSaving) return;
    setIsSaving(true);
    const clientId = getClientId();
    try {
      updateWatchlistLabel(address, editLabel);
      setEditingId(null);
      toast.success('Label updated');

      const ok = await renameRemoteWallet(clientId, address, editLabel);
      if (!ok) toast('Updated locally. Supabase sync unavailable.', { icon: 'ℹ️' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-cyan/10 border border-cyan/20 flex items-center justify-center">
            <Bookmark className="w-5 h-5 text-cyan" />
          </div>
          <h1 className="text-2xl font-black">Tracked Wallets</h1>
        </div>
        <p className="text-text-3">Simple saved wallet list for quick re-analysis.</p>
        {isLoadingRemote && <p className="text-xs text-text-3 mt-2">Syncing watchlist...</p>}
      </div>

      {/* Add wallet */}
      <div className="glass-card p-5 mb-6">
        <h3 className="font-semibold text-sm mb-3">Add Wallet</h3>
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3" />
            <input
              value={newAddress}
              onChange={(e) => { setNewAddress(e.target.value); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Paste Solana wallet address..."
              className="input-primary pl-9 w-full font-mono text-base"
            />
          </div>
          <button onClick={handleAdd} className="btn-primary px-6 text-sm disabled:cursor-not-allowed disabled:opacity-70" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Add'}
          </button>
        </div>
        {error && <p className="text-red text-xs mt-1.5">{error}</p>}
      </div>

      {/* Watchlist */}
      {watchlist.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <Bookmark className="w-12 h-12 mx-auto mb-4 text-text-3 opacity-30" />
          <h3 className="text-lg font-semibold mb-2">Your watchlist is empty</h3>
          <p className="text-text-3 text-sm">
            Add wallets above or click the Watch button on any wallet page
          </p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="p-4 border-b border-border">
            <span className="text-sm text-text-3">{watchlist.length} wallet{watchlist.length !== 1 && 's'}</span>
          </div>
          <div className="divide-y divide-border">
            {watchlist.map((entry, i) => (
              <div
                key={entry.address}
                className="flex items-center gap-4 p-4 hover:bg-surface-2/30 group"
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent/20 to-cyan/20 border border-accent/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-accent">{i + 1}</span>
                </div>

                <div className="flex-1 min-w-0">
                  {editingId === entry.address ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveLabel(entry.address);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="input-primary text-base flex-1"
                        autoFocus
                        placeholder="Custom label..."
                      />
                      <button onClick={() => saveLabel(entry.address)} className="btn-primary py-1.5 px-3 text-xs">Save</button>
                      <button onClick={() => setEditingId(null)} className="text-text-3 hover:text-text">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        {entry.label ? (
                          <p className="font-semibold text-sm">{entry.label}</p>
                        ) : null}
                        <code className="font-mono text-xs text-text-2">
                          {shortenAddress(entry.address, 8)}
                        </code>
                      </div>
                      <p className="text-xs text-text-3 mt-0.5">
                        Added {new Date(entry.addedAt).toLocaleDateString()}
                      </p>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <Link
                    href={`/wallet/${entry.address}`}
                    className="btn-ghost p-2 text-xs"
                    title="View dashboard"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={() => { setEditingId(entry.address); setEditLabel(entry.label ?? ''); }}
                    className="btn-ghost p-2 disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={isSaving}
                    title="Edit label"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleRemove(entry.address)}
                    className="btn-ghost p-2 hover:text-red disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={isSaving}
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
