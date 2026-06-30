import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Fallback to hardcoded Resend key if not present in environment for development
    const resendApiKey = process.env.RESEND_API_KEY || 're_YBdNY2TB_Asd3bf4ZAwhYuoUKqaNg3TSH';
    const resend = new Resend(resendApiKey);

    const { company_id, text } = await req.json();

    if (!company_id || !text) {
      return NextResponse.json({ error: 'Missing company_id or text' }, { status: 400 });
    }

    // 1. Get the contact's email
    const { data: contacts } = await supabase
      .from('contacts')
      .select('email')
      .eq('company_id', company_id);

    const targetEmail = contacts?.find(c => c.email)?.email;
    if (!targetEmail) {
      return NextResponse.json({ error: 'No email found for this contact' }, { status: 400 });
    }

    // 2. Send the email using Resend
    const { error: sendError } = await resend.emails.send({
      from: 'Webcord <hello@webcord.in>',
      to: targetEmail,
      subject: 'Following up on Webcord',
      text: text,
      html: `<div style="font-family: 'Inter', sans-serif; color: #111; line-height: 1.6; white-space: pre-wrap;">${text}</div>`
    });

    if (sendError) throw sendError;

    // 3. Save to emails table as outbound
    const { error: dbError } = await supabase.from('emails').insert({
      company_id: company_id,
      direction: 'outbound',
      subject: 'Following up on Webcord',
      body_text: text
    });

    if (dbError) throw dbError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Failed to send reply:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
