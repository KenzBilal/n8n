import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const { id, type } = await req.json(); // id = company_id
    
    // 1. Get the company
    const { data: company } = await supabase.from('companies').select('*').eq('id', id).single();
    if (!company) throw new Error("Company not found");

    // 2. Get the audit results to find semantic data
    const { data: audit } = await supabase.from('audits').select('id').eq('company_id', id).single();
    let semanticData = null;
    if (audit) {
      const { data: results } = await supabase.from('audit_results').select('*').eq('audit_id', audit.id);
      if (results) {
        const pitchRes = results.find(r => r.category === 'AI_PITCH');
        if (pitchRes && pitchRes.raw_data?.businessContext?.semantic) {
          semanticData = pitchRes.raw_data.businessContext.semantic;
        }
      }
    }

    // 2.5 Get the latest inbound email
    const { data: inboundEmail } = await supabase
      .from('emails')
      .select('body_text')
      .eq('company_id', id)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // 3. Generate Draft using Gemini
    const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });

    let prompt = `You are the founder of Webcord, an elite performance marketing agency.
You just received a positive reply from ${company.name} regarding your cold email.
Your goal is to write a warm, conversational follow-up to move them towards a quick discovery call.

Company Info:
Industry: ${semanticData?.industry || company.industry || 'Unknown'}
What they do: ${semanticData?.primaryService || 'Unknown'}
Target Audience: ${semanticData?.targetAudience || 'Unknown'}

${inboundEmail ? `The client just replied with this email:\n"""\n${inboundEmail.body_text}\n"""\nWrite a response specifically addressing what they said.` : ''}
`;

    if (type === 'whatsapp') {
      prompt += `
Format: This will be sent on WHATSAPP.
Rules:
- Extremely brief, max 2 sentences.
- Highly conversational, friendly, like texting a friend.
- Do NOT use formal sign-offs (no "Best," or "Cheers,").
- Just casually suggest a 10 min call this week or ask a quick question about their process.
`;
    } else {
      prompt += `
Format: This will be sent as an EMAIL.
Rules:
- Keep it under 4 sentences.
- Professional but warm.
- Acknowledge their interest and suggest a brief 10-15 minute call.
- Include a simple sign-off "Best, [Your Name] / Webcord Team".
`;
    }

    const result = await model.generateContent(prompt);
    const draft = result.response.text().trim();

    return NextResponse.json({ draft });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ draft: "Hey! Glad you reached out. Let's find a time to chat." }); // fallback
  }
}
