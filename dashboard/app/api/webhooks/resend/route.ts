import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Webhook } from 'svix';
import { headers } from 'next/headers';

export async function POST(req: Request) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL || 'https://dummy.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key'
    );
    
    const payloadString = await req.text();
    const headerPayload = await headers();
    const svix_id = headerPayload.get("svix-id");
    const svix_timestamp = headerPayload.get("svix-timestamp");
    const svix_signature = headerPayload.get("svix-signature");

    if (!svix_id || !svix_timestamp || !svix_signature) {
      return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 });
    }

    // Use environment variable in production, fallback to hardcoded for immediate use
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET || 'whsec_wtI7tX1nH8jOfbyG3+KG+PwygVNSefJ+';
    const wh = new Webhook(webhookSecret);
    
    let payload: any;
    try {
      payload = wh.verify(payloadString, {
        "svix-id": svix_id,
        "svix-timestamp": svix_timestamp,
        "svix-signature": svix_signature,
      });
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    if (payload.type !== 'email.received') {
      return NextResponse.json({ message: 'Ignored' });
    }

    const { from, subject, text } = payload.data;
    
    // Extract email string if it comes as "Name <email@domain.com>"
    const emailMatch = from.match(/<([^>]+)>/) || [null, from];
    const senderEmail = emailMatch[1].toLowerCase().trim();

    // Find the company ID by matching the contact email
    const { data: contact } = await supabase
      .from('contacts')
      .select('company_id')
      .ilike('email', senderEmail)
      .single();

    if (!contact) {
      console.log(`Received email from unknown contact: ${senderEmail}`);
      return NextResponse.json({ message: 'Contact not found' });
    }

    // Save the inbound email
    const { data: emailData, error: emailError } = await supabase
      .from('emails')
      .insert({
        company_id: contact.company_id,
        direction: 'inbound',
        subject: subject,
        body_text: text
      })
      .select()
      .single();

    if (emailError) throw emailError;

    // Update company status to REPLIED
    await supabase
      .from('companies')
      .update({ status: 'REPLIED' })
      .eq('id', contact.company_id);

    // Queue job for Gemini to process the reply
    await supabase.from('jobs').insert({
      type: 'PROCESS_REPLY',
      status: 'PENDING',
      payload: { 
        email_id: emailData.id, 
        company_id: contact.company_id, 
        body_text: text 
      }
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Webhook Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
