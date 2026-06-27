import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';
import ws from 'ws';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  realtime: { transport: ws }
});
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function retroGroq() {
  console.log('Fetching audit results missing Groq suggestions...');
  
  const { data: results, error } = await supabase
    .from('audit_results')
    .select('id, audit_id, raw_data, issues_found')
    .eq('category', 'AI_PITCH');

  if (error) {
    console.error(error);
    return;
  }

  const needsGroq = results; // Re-run for everyone to apply the new aggressive prompt
  console.log(`Found ${needsGroq.length} items to regenerate with new prompt.`);

  for (const item of needsGroq) {
    const auditData = item.raw_data;
    if (!auditData || !auditData.url) {
        console.log(`Skipping ID ${item.id} - no raw audit data`);
        continue;
    }
    console.log(`Processing Groq for ${auditData.url}...`);
    
    const prompt = `
    You are the lead strategist at Webcord.
    We just audited a potential client's website: ${auditData.url}
    Score: ${auditData.score}/100.
    Issues found: ${auditData.issues?.map(i => i.issue).join(', ')}
    
    Write a ruthless, internal-only cheat sheet for ME (the salesperson). 
    Tell me exactly what is broken on their site and exactly what Webcord service to sell them to fix it.
    
    Rules:
    - DO NOT talk to the client. Talk to ME. (Use "They have", not "You have").
    - Be blunt, specific, and tactical.
    - Format as 3-4 bullet points.
    
    Example:
    - They have 14 images missing alt-text. Pitch them our SEO & Accessibility Optimization package to fix their broken search rankings.
    - Load time is a catastrophic 5.5s because of 38 bloated scripts. Sell them our Speed Optimization service to stop them losing conversions.
    `;
    
    try {
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.1-8b-instant",
        temperature: 0.3,
      });
      
      const suggestions = completion.choices[0]?.message?.content?.trim() || "No suggestions generated.";
      
      const newIssuesFound = { ...item.issues_found, suggestions };
      
      await supabase
        .from('audit_results')
        .update({ issues_found: newIssuesFound })
        .eq('id', item.id);
        
      console.log(`✓ Added Groq suggestions for ${auditData.url}`);
    } catch (e) {
      console.error(`X Failed for ${auditData.url}:`, e.message);
    }
    
    // small delay to respect free tier rate limit
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log('Done!');
}

retroGroq();
