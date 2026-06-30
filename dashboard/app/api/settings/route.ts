import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!
  );
}

export async function GET() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('global_settings')
    .select('*');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const settings: Record<string, string> = {};
  data?.forEach((row: { key: string; value: string }) => {
    settings[row.key] = row.value;
  });
  return NextResponse.json(settings);
}

export async function POST(req: Request) {
  const supabase = getSupabase();
  const body = await req.json();
  const updates = Object.entries(body);

  for (const [key, value] of updates) {
    await supabase
      .from('global_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() });
  }

  return NextResponse.json({ ok: true });
}
