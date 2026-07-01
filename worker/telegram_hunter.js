// worker/telegram_hunter.js
// Phase 4: Autonomous Hunter — finds Telegram business leads via two strategies:
// Strategy A: Mass Extraction (Groq-generated keywords → join groups → extract members)
// Strategy B: Live Sniper (keyword listening in public groups)
// NOTE: TelegramClient is a placeholder — connect when phone number is ready.

import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';
import 'dotenv/config';

import ws from 'ws';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  realtime: { transport: ws }
});
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── Sniper Keywords (triggers instant DM even if daily limit is hit) ─────────
const SNIPER_KEYWORDS = [
  'need a website', 'need a web developer', 'looking for a developer',
  'need a web design', 'website developer needed', 'need someone to build',
  'looking for web dev', 'need a landing page', 'need an app built',
  'need a telegram bot', 'need a mini app', 'anyone build telegram bots',
];

// ─── Get Settings from DB ─────────────────────────────────────────────────────
async function getSettings() {
  const { data } = await supabase.from('global_settings').select('*');
  const s = {};
  data?.forEach(row => { s[row.key] = row.value; });
  return s;
}

// ─── Check Daily DM Count ─────────────────────────────────────────────────────
async function getDailyDMCount() {
  const today = new Date().toISOString().split('T')[0];
  const { count } = await supabase
    .from('telegram_leads')
    .select('*', { count: 'exact', head: true })
    .gte('pitch_sent_at', today + 'T00:00:00Z');
  return count || 0;
}

// ─── Check if Lead Already Exists ─────────────────────────────────────────────
async function leadExists(chatId) {
  const { data } = await supabase
    .from('telegram_leads')
    .select('id')
    .eq('chat_id', chatId)
    .single();
  return !!data;
}

// ─── Save Lead to DB ──────────────────────────────────────────────────────────
async function saveLead({ chatId, username, fullName, phone, email, instagram, location, website, sourceGroup, category }) {
  const exists = await leadExists(chatId);
  if (exists) return null;

  const { data, error } = await supabase.from('telegram_leads').insert({
    chat_id: chatId,
    username,
    full_name: fullName,
    phone,
    email,
    instagram,
    location,
    website,
    source_group: sourceGroup,
    category,
    status: 'PENDING',
  }).select().single();

  if (error) console.error('[HUNTER] Failed to save lead:', error.message);
  return data;
}

// ─── Generate Daily Search Keywords (Groq) ────────────────────────────────────
export async function generateSearchKeywords() {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const result = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [{
      role: 'user',
      content: `Generate 10 diverse Telegram group search keywords for finding business owners. 
Today is ${today}. Vary the niches: include some of these types: crypto signals, movies/series sharing, exam question banks, online stores, freelancers, coaching/courses, real estate, food delivery, clothing shops, travel agents, resellers.
Return ONLY a JSON array of strings. No explanation.
Example: ["crypto vip signals group", "NEET exam question bank", "dropshipping business owners"]`
    }],
    max_tokens: 200,
  });

  try {
    const content = result.choices[0].message.content.trim();
    const match = content.match(/\[.*\]/s);
    return match ? JSON.parse(match[0]) : [];
  } catch {
    return ['business owners telegram group', 'online store owners', 'telegram resellers'];
  }
}

// ─── Extract Contact Info from Telegram Bio/Posts ─────────────────────────────
export function extractContactInfo(text) {
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = text.match(/\+?[0-9]{10,14}/);
  const instaMatch = text.match(/(?:instagram\.com\/|@)([a-zA-Z0-9._]{2,30})/i);
  const websiteMatch = text.match(/https?:\/\/(?!t\.me)[^\s]+/);
  const locationMatch = text.match(/(?:based in|location:|from|city:)\s*([A-Za-z ,]+)/i);

  return {
    email: emailMatch?.[0] || null,
    phone: phoneMatch?.[0] || null,
    instagram: instaMatch ? `@${instaMatch[1]}` : null,
    website: websiteMatch?.[0] || null,
    location: locationMatch?.[1]?.trim() || null,
  };
}

// ─── Strategy A: Mass Group Extraction ────────────────────────────────────────
// This function is called by the Userbot once connected.
// It receives a channel entity from the TelegramClient and processes it.
export async function processTelegramChannel(channel, participants, sendPitchFn) {
  const settings = await getSettings();
  const dailyLimit = parseInt(settings.telegram_daily_limit || '20');
  let dmCount = await getDailyDMCount();

  const bio = channel.about || '';
  const channelName = channel.title || '';

  // Extract contact info from bio
  const contacts = extractContactInfo(bio);

  // If bio contains a website, route to main email scraper instead
  if (contacts.website) {
    console.log(`[HUNTER] Bio website found: ${contacts.website} → routing to main scraper`);
    await supabase.from('jobs').insert({
      type: 'SCRAPE',
      status: 'PENDING',
      payload: { target: contacts.website, source: 'telegram_bio' },
    });
  }

  // Categorize the channel using Groq
  const category = await categorizeChannel(channelName, bio);

  // Process each member
  for (const participant of participants) {
    if (dmCount >= dailyLimit) {
      console.log(`[HUNTER] Daily limit (${dailyLimit}) reached. Stopping mass extraction.`);
      break;
    }

    const chatId = participant.id?.value || participant.id;
    if (!chatId) continue;

    const lead = await saveLead({
      chatId,
      username: participant.username,
      fullName: `${participant.firstName || ''} ${participant.lastName || ''}`.trim(),
      ...contacts,
      sourceGroup: channelName,
      category,
    });

    if (lead) {
      const pitch = await generateInitialPitch(category, channelName);
      await sendPitchFn(chatId, pitch);

      await supabase.from('telegram_leads').update({
        status: 'ACTIVE',
        pitch_sent_at: new Date().toISOString(),
      }).eq('id', lead.id);

      dmCount++;
      console.log(`[HUNTER] Pitched ${participant.username || chatId} (${category}) [${dmCount}/${dailyLimit}]`);

      // Human-like delay: 30-45 minutes between pitches
      const delay = (30 + Math.random() * 15) * 60 * 1000;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// ─── Strategy B: Live Sniper ─────────────────────────────────────────────────
// Called by the Userbot when any message is detected in monitored groups.
export async function processSniperMessage(chatId, username, message, groupName, sendPitchFn) {
  const lowerMsg = message.toLowerCase();
  const isSniper = SNIPER_KEYWORDS.some(k => lowerMsg.includes(k));
  if (!isSniper) return;

  const exists = await leadExists(chatId);
  if (exists) return;

  console.log(`[SNIPER] Triggered! "${message.substring(0, 60)}" in ${groupName}`);

  // Sniper overrides daily limit
  const lead = await saveLead({
    chatId,
    username,
    sourceGroup: groupName,
    category: 'Sniper Lead',
  });

  if (lead) {
    const pitch = `Hey! Saw your message about needing a developer. We build websites, Telegram bots, and mini apps at Webcord. Might be exactly what you need — what are you trying to build?`;
    await sendPitchFn(chatId, pitch);

    await supabase.from('telegram_leads').update({
      status: 'ACTIVE',
      pitch_sent_at: new Date().toISOString(),
    }).eq('id', lead.id);

    console.log(`[SNIPER] Pitched @${username} (Sniper Override)`);
  }
}

// ─── Categorize Channel ───────────────────────────────────────────────────────
async function categorizeChannel(name, bio) {
  try {
    const result = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{
        role: 'user',
        content: `Categorize this Telegram channel in 2-3 words:
Name: ${name}
Bio: ${bio}
Return ONLY the category, nothing else. Examples: "Crypto Signals", "Movie Sharing", "Exam Question Bank", "Online Clothing Store", "Coaching/Courses"`
      }],
      max_tokens: 20,
    });
    return result.choices[0].message.content.trim();
  } catch {
    return 'Unknown Business';
  }
}

// ─── Generate Initial Pitch ───────────────────────────────────────────────────
async function generateInitialPitch(category, groupName) {
  const result = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [{
      role: 'user',
      content: `You are Kenz from Webcord (a web dev agency). Write a very short, casual, human-sounding first message (max 3 lines) to the admin of a Telegram channel.

Channel Type: ${category}
Channel Name: ${groupName}

The message should:
1. Acknowledge their Telegram presence naturally
2. Hint at a specific problem they might have (based on their category)
3. Open the conversation with a question

Do NOT mention you found them on Telegram. Do NOT be salesy. Sound like a human.
Return ONLY the message, nothing else.`
    }],
    max_tokens: 100,
  });
  return result.choices[0].message.content.trim();
}

// ─── Auto-Cleanup: Delete ghosts (no reply in 3 days) ────────────────────────
export async function runCleanup() {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data: ghosts } = await supabase
    .from('telegram_leads')
    .select('id')
    .eq('status', 'ACTIVE')
    .lt('updated_at', threeDaysAgo);

  if (ghosts?.length) {
    const ids = ghosts.map(g => g.id);
    await supabase.from('telegram_leads').delete().in('id', ids);
    console.log(`[CLEANUP] Deleted ${ids.length} ghosted leads`);
  }
}

// ─── Main Entry Point (called by Userbot) ────────────────────────────────────
// When the phone number is connected, the Userbot script will:
// 1. Call generateSearchKeywords() daily
// 2. For each keyword, search for groups and call processTelegramChannel()
// 3. Listen to all group messages and call processSniperMessage()
// 4. Listen to DMs and call processIncomingMessage() from telegram_agent.js
// 5. Run runCleanup() every 6 hours
console.log('[HUNTER] Module loaded. Waiting for Userbot connection...');
