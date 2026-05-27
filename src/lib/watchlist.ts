export interface RemoteWatchlistEntry {
  address: string;
  label?: string;
  addedAt: string;
}

const CLIENT_ID_KEY = 'wallet-analyzer-client-id';

export function getClientId(): string {
  if (typeof window === 'undefined') return 'server';

  const cached = window.localStorage.getItem(CLIENT_ID_KEY);
  if (cached) return cached;

  const generated =
    typeof window.crypto?.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  window.localStorage.setItem(CLIENT_ID_KEY, generated);
  return generated;
}

interface WatchlistResponse {
  success: boolean;
  data?: RemoteWatchlistEntry[];
  error?: string;
}

async function request(url: string, init?: RequestInit): Promise<WatchlistResponse> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  return response.json();
}

export async function fetchRemoteWatchlist(clientId: string): Promise<RemoteWatchlistEntry[] | null> {
  const payload = await request(`/api/watchlist?clientId=${encodeURIComponent(clientId)}`);
  return payload.success && payload.data ? payload.data : null;
}

export async function trackRemoteWallet(clientId: string, address: string, label?: string): Promise<boolean> {
  const payload = await request('/api/watchlist', {
    method: 'POST',
    body: JSON.stringify({ clientId, address, label }),
  });
  return payload.success;
}

export async function untrackRemoteWallet(clientId: string, address: string): Promise<boolean> {
  const payload = await request('/api/watchlist', {
    method: 'DELETE',
    body: JSON.stringify({ clientId, address }),
  });
  return payload.success;
}

export async function renameRemoteWallet(clientId: string, address: string, label: string): Promise<boolean> {
  const payload = await request('/api/watchlist', {
    method: 'PATCH',
    body: JSON.stringify({ clientId, address, label }),
  });
  return payload.success;
}
