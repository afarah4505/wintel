import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WatchlistEntry {
  address: string;
  label?: string;
  addedAt: string;
}

interface AppState {
  watchlist: WatchlistEntry[];
  replaceWatchlist: (entries: WatchlistEntry[]) => void;
  addToWatchlist: (address: string, label?: string) => void;
  removeFromWatchlist: (address: string) => void;
  isWatchlisted: (address: string) => boolean;
  updateWatchlistLabel: (address: string, label: string) => void;

  recentSearches: string[];
  addRecentSearch: (address: string) => void;
  clearRecentSearches: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      watchlist: [],
      replaceWatchlist: (entries) => set({ watchlist: entries }),
      addToWatchlist: (address, label) => {
        if (get().isWatchlisted(address)) return;
        set((s) => ({
          watchlist: [
            ...s.watchlist,
            { address, label, addedAt: new Date().toISOString() },
          ],
        }));
      },
      removeFromWatchlist: (address) => {
        set((s) => ({ watchlist: s.watchlist.filter((w) => w.address !== address) }));
      },
      isWatchlisted: (address) => get().watchlist.some((w) => w.address === address),
      updateWatchlistLabel: (address, label) => {
        set((s) => ({
          watchlist: s.watchlist.map((w) => (w.address === address ? { ...w, label } : w)),
        }));
      },

      recentSearches: [],
      addRecentSearch: (address) =>
        set((s) => ({
          recentSearches: [address, ...s.recentSearches.filter((a) => a !== address)].slice(0, 10),
        })),
      clearRecentSearches: () => set({ recentSearches: [] }),
    }),
    {
      name: 'wallet-analyzer-storage',
      partialize: (state) => ({
        watchlist: state.watchlist,
        recentSearches: state.recentSearches,
      }),
    }
  )
);
