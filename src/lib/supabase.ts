import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient | null {
  if (client) return client;

  const rawUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!rawUrl || !key) return null;

  // Accept either project root URL or /rest/v1 URL in env.
  const url = rawUrl.replace(/\/rest\/v1\/?$/, '');

  client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return client;
}
