import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { isValidSolanaAddress } from '@/lib/utils';

const TABLE = 'tracked_wallets';

function unavailableResponse() {
  return NextResponse.json(
    { success: false, error: 'Supabase is not configured. Using local-only tracking.' },
    { status: 503 }
  );
}

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId')?.trim();
  if (!clientId) {
    return NextResponse.json({ success: false, error: 'Missing clientId' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) return unavailableResponse();

  const { data, error } = await supabase
    .from(TABLE)
    .select('wallet_address,label,added_at')
    .eq('client_id', clientId)
    .order('added_at', { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: (data || []).map((row) => ({
      address: row.wallet_address,
      label: row.label || undefined,
      addedAt: row.added_at,
    })),
  });
}

export async function POST(request: NextRequest) {
  const { clientId, address, label } = await request.json();

  if (!clientId || !address) {
    return NextResponse.json({ success: false, error: 'Missing clientId or address' }, { status: 400 });
  }
  if (!isValidSolanaAddress(address)) {
    return NextResponse.json({ success: false, error: 'Invalid Solana address' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) return unavailableResponse();

  const { error } = await supabase.from(TABLE).upsert(
    {
      client_id: String(clientId),
      wallet_address: String(address),
      label: typeof label === 'string' ? label : null,
      added_at: new Date().toISOString(),
    },
    { onConflict: 'client_id,wallet_address' }
  );

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest) {
  const { clientId, address, label } = await request.json();

  if (!clientId || !address || typeof label !== 'string') {
    return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) return unavailableResponse();

  const { error } = await supabase
    .from(TABLE)
    .update({ label })
    .eq('client_id', String(clientId))
    .eq('wallet_address', String(address));

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const { clientId, address } = await request.json();

  if (!clientId || !address) {
    return NextResponse.json({ success: false, error: 'Missing clientId or address' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) return unavailableResponse();

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('client_id', String(clientId))
    .eq('wallet_address', String(address));

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
