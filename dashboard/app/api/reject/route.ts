import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  const { id } = await req.json();
  
  await supabase.from("companies").update({ status: 'REJECTED' }).eq("id", id);
  
  const { data: audit } = await supabase.from("audits").select("id").eq("company_id", id).single();
  if (audit) {
    await supabase.from("audit_results").insert({
      audit_id: audit.id,
      category: 'REJECTED',
      raw_data: {},
      issues_found: { rejection_reason: "Manually deleted/rejected" }
    });
  }
  
  return NextResponse.json({ success: true });
}
