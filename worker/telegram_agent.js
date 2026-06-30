// worker/telegram_agent.js
// Phase 3: Gemini Sales Brain — manages live Telegram conversations
// NOTE: Userbot connection (TelegramClient) is a placeholder pending phone number setup.

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(process.env.TELEGRAM_GEMINI_API_KEY);

// ─── Company Knowledge Brain ──────────────────────────────────────────────────
const WEBCORD_SYSTEM_PROMPT = `You are Kenz, a sales representative at Webcord — a web development and digital solutions agency.

COMPANY OVERVIEW:
- Company Name: Webcord
- Website: webcord.in
- Specialty: Building websites, Telegram bots, Telegram Mini Apps, web apps, and e-commerce platforms
- Target Clients: Telegram businesses, local businesses, online stores, content creators

WHAT WE BUILD:
1. Professional Websites — Landing pages, business sites, portfolios
2. E-commerce Platforms — Full online stores with payment integration
3. Telegram Bots — Automated customer support, subscription management, payment bots
4. Telegram Mini Apps — In-chat apps for payments, bookings, streaming, quizzes
5. Web Portals — Exam platforms, streaming sites, membership platforms

HOW YOU BEHAVE:
- Talk like a real human, not a robot. Keep messages SHORT (2-4 lines max per message).
- Use casual language. Be warm, confident, not salesy.
- NEVER say you are an AI. NEVER say "As an AI". You are Kenz.
- NEVER reveal company secrets, pricing models, or internal processes unless asked directly.
- If asked about pricing, say "depends on the scope, let me understand what you need first"
- If client says "not interested", push back ONCE with a value-add offer. If they reject again, thank them and end.

CONVERSATION GOAL:
1. Understand their business model and current platform (just Telegram? website? nothing?)
2. Identify their biggest pain point (no website, no payment system, no customer support, etc.)
3. Propose the BEST solution from our services above
4. Get them excited enough to agree to move forward
5. Once they agree, say "Great! Let me get this noted for our team" and flag the chat for admin approval.

HARD RULES:
- If someone asks "are you a bot?", deny it naturally. Say "nah I'm just checking channels, saw yours and thought it was cool"
- NEVER copy-paste long paragraphs. Keep it conversational.
- NEVER send more than 3 messages in a row without waiting for their reply.
- ANTI-HALLUCINATION: NEVER make up pricing. If they ask for cheap work (e.g. "$5"), firmly decline and state we are a premium agency. 
- ANTI-HALLUCINATION: NEVER promise features we don't build. Stick strictly to the "WHAT WE BUILD" list.
`;

// ─── Get Settings from DB ─────────────────────────────────────────────────────
async function getSettings() {
  const { data } = await supabase.from('global_settings').select('*');
  const s = {};
  data?.forEach(row => { s[row.key] = row.value; });
  return s;
}

// ─── Generate AI Reply ────────────────────────────────────────────────────────
export async function generateReply(lead, userMessage) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  // Build chat history from DB
  const history = (lead.chat_history || []).map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  const chat = model.startChat({
    history,
    systemInstruction: WEBCORD_SYSTEM_PROMPT,
    generationConfig: { maxOutputTokens: 200, temperature: 0.8 },
  });

  const result = await chat.sendMessage(userMessage);
  const reply = result.response.text().trim();

  // Detect if deal is closed
  const closedKeywords = ['yes', 'okay', 'lets do it', "let's do it", 'sure', 'agreed', 'go ahead', 'proceed'];
  const isClosing = closedKeywords.some(k => userMessage.toLowerCase().includes(k));

  // Detect hard rejection
  const rejectionKeywords = ['not interested', 'no thanks', 'stop', 'leave me alone', 'dont contact'];
  const isHardReject = rejectionKeywords.some(k => userMessage.toLowerCase().includes(k));

  return { reply, isClosing, isHardReject };
}

// ─── Generate AI Executive Summary ────────────────────────────────────────────
export async function generateSummary(lead) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const chatText = (lead.chat_history || [])
    .map(m => `${m.role === 'assistant' ? 'Webcord' : 'Client'}: ${m.content}`)
    .join('\n');

  const result = await model.generateContent(
    `Based on this Telegram conversation, generate an executive summary in exactly 3 lines:
Line 1: "Name: [full name or username]"
Line 2: "Category: [business type]"  
Line 3: "Needs: [what they want in one sentence]"

Conversation:
${chatText}`
  );

  return result.response.text().trim();
}

// ─── Process Incoming Message ─────────────────────────────────────────────────
export async function processIncomingMessage(chatId, userMessage, sendMessageFn) {
  // Fetch lead from DB by chat_id
  let { data: lead } = await supabase
    .from('telegram_leads')
    .select('*')
    .eq('chat_id', chatId)
    .single();

  if (!lead) return; // Unknown user, ignore

  // Don't respond to approved or rejected leads
  if (['APPROVED', 'REJECTED', 'HUMAN_TAKEOVER'].includes(lead.status)) return;

  // Check for website URL in message
  const urlMatch = userMessage.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    const url = urlMatch[0];
    await handleLiveAuditTrigger(lead, url, chatId, sendMessageFn);
    return;
  }

  // Generate Gemini reply
  const { reply, isClosing, isHardReject } = await generateReply(lead, userMessage);

  // Update chat history in DB
  const updatedHistory = [
    ...(lead.chat_history || []),
    { role: 'user', content: userMessage },
    { role: 'assistant', content: reply },
  ];

  let newStatus = lead.status;

  if (isHardReject) {
    // Second rejection = full delete
    const prevHistory = lead.chat_history || [];
    const prevRejection = prevHistory.some(m => m.role === 'user' &&
      ['not interested', 'no thanks'].some(k => m.content.toLowerCase().includes(k)));

    if (prevRejection) {
      await supabase.from('telegram_leads').delete().eq('id', lead.id);
      return;
    }
    newStatus = 'ACTIVE'; // First rejection, let AI push back once
  }

  if (isClosing) {
    newStatus = 'NEEDS_APPROVAL';
    const summary = await generateSummary({ ...lead, chat_history: updatedHistory });
    await supabase.from('telegram_leads').update({
      status: newStatus,
      chat_history: updatedHistory,
      ai_summary: summary,
      updated_at: new Date().toISOString(),
    }).eq('id', lead.id);

    // Notify admin (will be wired to sendMessageFn when phone number is connected)
    await notifyAdmin(lead, summary);
  } else {
    await supabase.from('telegram_leads').update({
      status: newStatus === 'PENDING' ? 'ACTIVE' : newStatus,
      chat_history: updatedHistory,
      updated_at: new Date().toISOString(),
    }).eq('id', lead.id);
  }

  // Send the reply via Telegram
  await sendMessageFn(chatId, reply);
}

// ─── Live Audit Trigger (Website URL detected in chat) ────────────────────────
async function handleLiveAuditTrigger(lead, url, chatId, sendMessageFn) {
  // Send filler message + typing
  await sendMessageFn(chatId, "Give me a sec, opening your site on my laptop... 👀");

  // Check if this URL is already queued in the main email scraper
  // If yes, cancel the email job (telegram takes priority)
  const { data: existingJob } = await supabase
    .from('jobs')
    .select('id')
    .eq('payload->target', url)
    .eq('status', 'PENDING')
    .single();

  if (existingJob) {
    await supabase.from('jobs').delete().eq('id', existingJob.id);
    console.log(`[AGENT] Cancelled email scraper job for ${url} — Telegram chat takes priority`);
  }

  // Queue a Telegram-tagged audit in the main scraper
  await supabase.from('jobs').insert({
    type: 'SCRAPE',
    status: 'PENDING',
    payload: { target: url, source: 'telegram_chat', telegram_lead_id: lead.id, telegram_chat_id: chatId },
  });

  // Subscribe to audit completion via Supabase Realtime (handled in index.js)
  // The main scraper will set source='telegram_chat' on the audit when done
  // The hunter script polls for this completion and calls back into the chat
  console.log(`[AGENT] Live audit queued for ${url} (lead: ${lead.id})`);
}

// ─── Notify Admin ─────────────────────────────────────────────────────────────
async function notifyAdmin(lead, summary) {
  const settings = await getSettings();
  const adminNumber = settings.admin_telegram_number;
  if (!adminNumber) return;

  // This will be wired to the Userbot sendMessageFn when phone number is connected
  console.log(`[AGENT] NOTIFY ADMIN (${adminNumber}):\n${summary}\n\nReply "approve" or "decline"`);
  // TODO: await sendMessageFn(adminChatId, `🔔 New Lead Ready for Approval!\n\n${summary}\n\nReply "approve" or "decline"`)
}

// ─── Automated Drip Sequence (Stateless) ──────────────────────────────────────
export function startDripCron(sendMessageFn) {
  console.log('[AGENT] Starting 24/7 Drip Sequence Cron (Hourly checks)...');
  
  setInterval(async () => {
    try {
      const { data: leads } = await supabase
        .from('telegram_leads')
        .select('*')
        .eq('status', 'ACTIVE');
        
      if (!leads) return;
      
      for (const lead of leads) {
        if (!lead.updated_at || !lead.chat_history || lead.chat_history.length === 0) continue;
        
        const lastMsg = lead.chat_history[lead.chat_history.length - 1];
        if (lastMsg.role !== 'assistant') continue; // We owe them a reply, no drip
        
        const daysSinceUpdate = (Date.now() - new Date(lead.updated_at).getTime()) / 86400000;
        const isBump = lastMsg.content.includes("just bumping this to the top");
        
        if (!isBump && daysSinceUpdate >= 3) {
          // Send Day 3 Bump
          const bumpText = "Hey, just bumping this to the top of your inbox. Let me know what you think when you have a sec.";
          console.log(`[DRIP] Sending Day 3 bump to ${lead.chat_id}`);
          await sendMessageFn(lead.chat_id, bumpText);
          
          const updatedHistory = [...lead.chat_history, { role: 'assistant', content: bumpText }];
          await supabase.from('telegram_leads').update({
            chat_history: updatedHistory,
            updated_at: new Date().toISOString()
          }).eq('id', lead.id);
        }
        else if (isBump && daysSinceUpdate >= 4) {
          // Send Day 7 Breakup (4 days since bump)
          const breakupText = "Assuming bad timing right now so closing your file. Feel free to reach out when you're ready to upgrade.";
          console.log(`[DRIP] Sending Day 7 breakup to ${lead.chat_id}`);
          await sendMessageFn(lead.chat_id, breakupText);
          
          const updatedHistory = [...lead.chat_history, { role: 'assistant', content: breakupText }];
          await supabase.from('telegram_leads').update({
            status: 'REJECTED',
            chat_history: updatedHistory,
            updated_at: new Date().toISOString()
          }).eq('id', lead.id);
        }
      }
    } catch (e) {
      console.error('[DRIP] Error running drip check:', e.message);
    }
  }, 1000 * 60 * 60); // 1 hour interval
}
