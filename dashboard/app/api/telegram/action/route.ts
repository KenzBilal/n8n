import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!
  );
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const { id, action } = await req.json();

  if (action === 'approve') {
    await supabase.from('telegram_leads').update({ status: 'APPROVED' }).eq('id', id);
  } else if (action === 'decline') {
    await supabase.from('telegram_leads').delete().eq('id', id);
  } else if (action === 'takeover') {
    await supabase.from('telegram_leads').update({ status: 'HUMAN_TAKEOVER' }).eq('id', id);
  }

  return NextResponse.json({ ok: true });
}
