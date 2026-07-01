import { createClient } from '@supabase/supabase-js';
import { Api } from 'telegram';
import { CallbackQuery } from 'telegram/events/CallbackQuery.js';
import Groq from 'groq-sdk';
import ws from 'ws';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  realtime: { transport: ws }
});
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Get settings helper
async function getSettings() {
  const { data } = await supabase.from('global_settings').select('*');
  const s = {};
  data?.forEach(row => { s[row.key] = row.value; });
  return s;
}

// Generate the Llama 3.1 summary
async function generateTeamSummary(lead) {
  const chatText = (lead.chat_history || [])
    .map(m => `${m.role === 'assistant' ? 'Webcord' : 'Client'}: ${m.content}`)
    .join('\n');

  const prompt = `Based on this Telegram conversation, extract the client details EXACTLY in this format. DO NOT add any extra conversational text.
  
🚨 CLIENT-${lead.id.substring(0, 6).toUpperCase()} 🚨

👤 Name: [Extract name or username]
📱 Phone: [Extract phone or "Not provided"]
🏢 Business: [Extract business category]

🎯 What they need:
- [Bullet 1 of exactly what they want built]
- [Bullet 2]
- [Bullet 3]

(Team, please initiate contact)

CHAT HISTORY:
${chatText}`;

  const completion = await groq.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    model: 'llama-3.1-8b-instant',
    temperature: 0.2,
  });

  return completion.choices[0].message.content.trim();
}

export async function initAdminRemote(client) {
  console.log('[ADMIN REMOTE] Initializing Supabase Realtime listeners...');
  const settings = await getSettings();
  
  if (!settings.admin_telegram_username || !settings.team_channel) {
    console.warn('[ADMIN REMOTE] Missing admin_telegram_username or team_channel in global_settings.');
  }

  // 1. Listen for Supabase DB Changes
  supabase
    .channel('admin-remote-channel')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'telegram_leads' },
      async (payload) => {
        const oldStatus = payload.old.status;
        const newStatus = payload.new.status;
        const lead = payload.new;

        // A. Lead needs approval -> Send to Admin Telegram
        if (oldStatus !== 'NEEDS_APPROVAL' && newStatus === 'NEEDS_APPROVAL') {
          if (!settings.admin_telegram_username) return;
          try {
            const adminMsg = `**New Approval Request**\n👤 ${lead.full_name || lead.username}\n🏢 ${lead.category || 'Unknown'}\n💬 "${lead.ai_summary || 'Needs review'}"`;
            
            const sent = await client.sendMessage(settings.admin_telegram_username, {
              message: adminMsg,
              buttons: client.buildReplyMarkup(
                new Api.ReplyInlineMarkup({
                  rows: [
                    new Api.KeyboardButtonRow({
                      buttons: [
                        new Api.KeyboardButtonCallback({ text: '✅ Approve', data: Buffer.from(`approve_${lead.id}`) }),
                        new Api.KeyboardButtonCallback({ text: '❌ Decline', data: Buffer.from(`decline_${lead.id}`) }),
                      ],
                    }),
                  ],
                })
              ),
            });

            // Save message ID so we can edit it later
            await supabase.from('telegram_leads').update({ admin_msg_id: sent.id }).eq('id', lead.id);
            console.log(`[ADMIN REMOTE] Sent approval request to ${settings.admin_telegram_username}`);
          } catch (e) {
            console.error('[ADMIN REMOTE] Failed to send approval request:', e.message);
          }
        }

        // B. Lead was Approved (from Dashboard OR Telegram)
        if (oldStatus !== 'APPROVED' && newStatus === 'APPROVED') {
          try {
            // 1. Remove buttons from Admin chat
            if (settings.admin_telegram_username && lead.admin_msg_id) {
              await client.editMessage(settings.admin_telegram_username, {
                message: lead.admin_msg_id,
                text: `✅ **APPROVED**\n👤 ${lead.full_name || lead.username}\n🏢 ${lead.category || 'Unknown'}`,
                buttons: null // removes buttons
              }).catch(() => {}); // ignore errors if msg deleted
            }

            // 2. Send handoff message to client
            await client.sendMessage(lead.chat_id, {
              message: "Great! Let me get our team to reach out with the next steps."
            });

            // 3. Generate summary and send to Team Channel
            if (settings.team_channel) {
              const summary = await generateTeamSummary(lead);
              await client.sendMessage(settings.team_channel, { message: summary });
              console.log(`[ADMIN REMOTE] Sent team broadcast for Client ${lead.id.substring(0, 6).toUpperCase()}`);
            }
          } catch (e) {
            console.error('[ADMIN REMOTE] Error processing approval:', e.message);
          }
        }

        // C. Lead was Rejected (from Dashboard OR Telegram)
        if (oldStatus !== 'REJECTED' && newStatus === 'REJECTED') {
          if (settings.admin_telegram_username && lead.admin_msg_id) {
            await client.editMessage(settings.admin_telegram_username, {
              message: lead.admin_msg_id,
              text: `❌ **DECLINED**\n👤 ${lead.full_name || lead.username}`,
              buttons: null
            }).catch(() => {});
          }
        }
      }
    )
    .subscribe();

  // 2. Listen for Telegram Inline Button Clicks
  client.addEventHandler(async (event) => {
    const data = event.data.toString();
    if (!data.startsWith('approve_') && !data.startsWith('decline_')) return;

    const action = data.split('_')[0];
    const leadId = data.substring(action.length + 1);

    try {
      await supabase
        .from('telegram_leads')
        .update({ status: action === 'approve' ? 'APPROVED' : 'REJECTED' })
        .eq('id', leadId);
        
      await event.answer({ message: `Marked as ${action.toUpperCase()}` });
    } catch (e) {
      console.error('[ADMIN REMOTE] Callback Error:', e.message);
      await event.answer({ message: "Database error. Try dashboard." });
    }
  }, new CallbackQuery());
  
  console.log('[ADMIN REMOTE] Inline button and Realtime handlers active.');
}
