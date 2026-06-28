// worker/telegram_userbot.js
// Phase 7: Userbot Entry Point — connect a real Telegram phone number
// Uses gramjs (Telegram MTProto library)
// STATUS: Ready to wire up. Awaiting phone number setup.
//
// SETUP INSTRUCTIONS (when phone number is ready):
// 1. Run: node worker/telegram_userbot.js --setup
// 2. Enter your phone number when prompted
// 3. Enter the SMS code Telegram sends
// 4. Session string is saved to global_settings DB automatically
// 5. Future restarts are fully automatic — no SMS needed ever again

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import { createClient } from '@supabase/supabase-js';
import readline from 'readline';
import 'dotenv/config';

import { processIncomingMessage } from './telegram_agent.js';
import {
  generateSearchKeywords,
  processTelegramChannel,
  processSniperMessage,
  runCleanup,
} from './telegram_hunter.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Telegram App credentials — get from https://my.telegram.org/apps
const API_ID = parseInt(process.env.TELEGRAM_API_ID || '0');
const API_HASH = process.env.TELEGRAM_API_HASH || '';

// ─── Load Session from DB ─────────────────────────────────────────────────────
async function loadSession() {
  const { data } = await supabase
    .from('global_settings')
    .select('value')
    .eq('key', 'telegram_session_string')
    .single();
  return data?.value || '';
}

// ─── Save Session to DB ───────────────────────────────────────────────────────
async function saveSession(sessionString) {
  await supabase.from('global_settings').upsert({
    key: 'telegram_session_string',
    value: sessionString,
    updated_at: new Date().toISOString(),
  });
  console.log('[USERBOT] Session string saved to database ✓');
}

// ─── Send Message Wrapper ─────────────────────────────────────────────────────
async function sendMessage(client, chatId, message) {
  try {
    // Split long messages into chunks for human-like behavior
    const chunks = message.match(/.{1,200}(?:\s|$)/g) || [message];
    for (const chunk of chunks) {
      await client.sendMessage(chatId, { message: chunk.trim() });
      if (chunks.length > 1) await new Promise(r => setTimeout(r, 800));
    }
  } catch (err) {
    console.error(`[USERBOT] Failed to send to ${chatId}:`, err.message);
  }
}

// ─── Get Admin Chat ID from Number ───────────────────────────────────────────
async function getAdminChatId(client) {
  const { data } = await supabase
    .from('global_settings')
    .select('value')
    .eq('key', 'admin_telegram_number')
    .single();

  const adminNumber = data?.value;
  if (!adminNumber) return null;

  try {
    const result = await client.getInputEntity(adminNumber);
    return result;
  } catch {
    console.warn('[USERBOT] Could not resolve admin number to chat ID');
    return null;
  }
}

// ─── Main Boot ────────────────────────────────────────────────────────────────
async function main() {
  const isSetup = process.argv.includes('--setup');

  let sessionString = await loadSession();
  const session = new StringSession(sessionString);

  if (!API_ID || !API_HASH) {
    console.error('[USERBOT] ERROR: TELEGRAM_API_ID and TELEGRAM_API_HASH not set in .env');
    console.error('Get them from: https://my.telegram.org/apps');
    process.exit(1);
  }

  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 5,
    retryDelay: 5000,
  });

  // ─── First-time Setup ────────────────────────────────────────────────────────
  if (isSetup || !sessionString) {
    console.log('[USERBOT] First-time setup. You will receive an SMS code.');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise(resolve => rl.question(q, resolve));

    await client.start({
      phoneNumber: async () => await ask('Enter your Webcord phone number (e.g. +91...): '),
      password: async () => await ask('2FA password (leave blank if none): '),
      phoneCode: async () => await ask('Enter SMS code: '),
      onError: (err) => console.error('[USERBOT] Auth error:', err.message),
    });

    const newSessionString = client.session.save();
    await saveSession(newSessionString);
    rl.close();
    console.log('[USERBOT] ✓ Setup complete! Restart without --setup flag to run normally.');
    process.exit(0);
  }

  // ─── Normal Boot ──────────────────────────────────────────────────────────────
  await client.connect();
  console.log('[USERBOT] ✓ Connected to Telegram');

  const adminChatId = await getAdminChatId(client);
  const sendFn = (chatId, msg) => sendMessage(client, chatId, msg);

  // ─── Listen to Incoming DMs ───────────────────────────────────────────────────
  client.addEventHandler(async (event) => {
    const msg = event.message;
    if (!msg.isPrivate) return;

    const chatId = msg.chatId?.value || msg.chatId;
    const text = msg.text;

    // Check if this is admin responding to an approval request
    if (adminChatId && chatId === adminChatId) {
      await handleAdminResponse(text, sendFn);
      return;
    }

    // Process client message through Gemini agent
    await processIncomingMessage(chatId, text, sendFn);
  }, new NewMessage({}));

  // ─── Listen to Group Messages (Sniper) ────────────────────────────────────────
  client.addEventHandler(async (event) => {
    const msg = event.message;
    if (msg.isPrivate) return;

    const chatId = msg.senderId?.value || msg.senderId;
    const username = (await client.getEntity(chatId))?.username;
    const groupName = event.message.chat?.title || 'Unknown Group';
    const text = msg.text;

    await processSniperMessage(chatId, username, text, groupName, sendFn);
  }, new NewMessage({}));

  // ─── Daily Hunter (runs every 24 hours) ───────────────────────────────────────
  const runDailyHunt = async () => {
    console.log('[HUNTER] Starting daily hunt...');
    const keywords = await generateSearchKeywords();
    console.log('[HUNTER] Keywords:', keywords);

    for (const keyword of keywords) {
      try {
        const results = await client.invoke({
          _: 'messages.searchGlobal',
          q: keyword,
          filter: { _: 'inputMessagesFilterEmpty' },
          minDate: 0, maxDate: 0, offsetRate: 0, offsetId: 0, limit: 5,
        });

        for (const chat of (results?.chats || [])) {
          try {
            const participants = await client.getParticipants(chat, { limit: 100 });
            await processTelegramChannel(chat, participants, sendFn);
          } catch (err) {
            console.warn(`[HUNTER] Could not get participants for ${chat.title}:`, err.message);
          }
        }
      } catch (err) {
        console.warn(`[HUNTER] Search failed for "${keyword}":`, err.message);
      }
    }
  };

  // ─── Cleanup Cron (every 6 hours) ─────────────────────────────────────────────
  setInterval(runCleanup, 6 * 60 * 60 * 1000);

  // Run hunt now + every 24 hours
  await runDailyHunt();
  setInterval(runDailyHunt, 24 * 60 * 60 * 1000);

  console.log('[USERBOT] Engine fully running. Listening for messages and hunting leads...');
}

// ─── Handle Admin Approval Responses ─────────────────────────────────────────
async function handleAdminResponse(text, sendFn) {
  const lower = text.toLowerCase().trim();
  if (!['approve', 'decline'].includes(lower)) return;

  // Find the most recent NEEDS_APPROVAL lead
  const { data: lead } = await supabase
    .from('telegram_leads')
    .select('*')
    .eq('status', 'NEEDS_APPROVAL')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (!lead) return;

  if (lower === 'approve') {
    await supabase.from('telegram_leads').update({ status: 'APPROVED' }).eq('id', lead.id);
    await sendFn(lead.chat_id, `Great! Let me get our team to reach out with the next steps. We'll contact you shortly to kick things off! 🚀`);
    console.log(`[ADMIN] Approved lead: ${lead.full_name || lead.username}`);
  } else {
    await supabase.from('telegram_leads').delete().eq('id', lead.id);
    console.log(`[ADMIN] Declined lead: ${lead.full_name || lead.username}`);
  }
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
process.on('SIGINT', async () => {
  console.log('[USERBOT] Shutting down gracefully...');
  process.exit(0);
});

main().catch(err => {
  console.error('[USERBOT] Fatal error:', err);
  process.exit(1);
});
