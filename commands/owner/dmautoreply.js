/**
 * DM Auto Reply Command
 *
 * Commands:
 *   .dm autoreply on           — Enable auto reply globally (OWNER DM only)
 *   .dm autoreply off          — Disable auto reply globally (OWNER DM only)
 *   .dm autoreply off#         — Disable auto reply for THIS specific DM only
 *   .dm autoreply reset#       — Remove THIS chat from exception list
 *   .dm autoreply message <t>  — Set custom auto reply message (OWNER DM only)
 *   .dm autoreply status       — Show current status
 *
 * Logic:
 *   1. If global OFF  → no reply sent anywhere
 *   2. If chat is in dmOffList → no reply for that chat
 *   3. Otherwise → send auto reply
 */

module.exports = {
  name: 'dm',
  aliases: ['dmautoreply'],
  category: 'owner',
  description: 'Manage DM Auto Reply system',
  ownerOnly: true,
  usage: '.dm autoreply on/off/off#/reset#/message <text>/status',

  async execute(sock, msg, args, extra) {
    const { reply, from, sender } = extra;
    const {
      getDmAutoReply,
      setDmAutoReply,
      getDmAutoReplyMessage,
      setDmAutoReplyMessage,
      getDmOffList,
      addToDmOffList,
      removeFromDmOffList,
      isInDmOffList,
    } = require('../../database');

    const config = require('../../config');

    const sub    = (args[0] || '').toLowerCase();
    const action = (args[1] || '').toLowerCase();

    if (sub !== 'autoreply') {
      return reply(
        `❓ *DM Auto Reply Commands:*\n\n` +
        `• *.dm autoreply on* — Enable auto reply globally _(owner DM only)_\n` +
        `• *.dm autoreply off* — Disable auto reply globally _(owner DM only)_\n` +
        `• *.dm autoreply off#* — Disable auto reply for THIS DM only\n` +
        `• *.dm autoreply reset#* — Re-enable auto reply for THIS DM\n` +
        `• *.dm autoreply message <text>* — Set reply message _(owner DM only)_\n` +
        `• *.dm autoreply status* — View current status`
      );
    }

    // ── Owner DM detection ───────────────────────────────────────────────────
    const ownerNumbers = config.ownerNumber || [];
    const toDigits = (s) => String(s || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    const isOwnDM = ownerNumbers.some((n) => {
      const ownerDigits = toDigits(n);
      return ownerDigits === toDigits(from) || ownerDigits === toDigits(sender);
    });

    const targetJid = from;

    // ════════════════════════════════════════════════════════════════════════
    // .dm autoreply on  — GLOBAL enable (owner DM only)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'on') {
      if (!isOwnDM) {
        return reply(
          `⚠️ *Global commands must be run in your own (owner) DM.*\n\n` +
          `_To disable auto reply for THIS chat only, use:_\n` +
          `*.dm autoreply off#*`
        );
      }
      setDmAutoReply(true);
      const currentMsg = getDmAutoReplyMessage();
      return reply(
        `✅ *DM Auto Reply Enabled Globally!*\n\n` +
        `📨 Auto reply message:\n_${currentMsg}_\n\n` +
        `_Applies to ALL private chats except those in the exception list._\n` +
        `_Use .dm autoreply message <text> to change the message._`
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // .dm autoreply off  — GLOBAL disable (owner DM only)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'off') {
      if (!isOwnDM) {
        return reply(
          `⚠️ *Global commands must be run in your own (owner) DM.*\n\n` +
          `_Did you mean to disable only this chat?_\n` +
          `_Use_ *.dm autoreply off#* _for per-chat disable._`
        );
      }
      setDmAutoReply(false);
      return reply(
        `❌ *DM Auto Reply Disabled Globally!*\n\n` +
        `_Bot will NOT auto-reply in any private chat._`
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // .dm autoreply off#  — LOCAL per-chat disable (any DM)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'off#') {
      addToDmOffList(targetJid);
      return reply(
        `🔕 *Auto Reply Disabled for This Chat Only*\n\n` +
        `_Bot will no longer send auto-replies in this DM._\n` +
        `_All other DMs are unaffected._\n\n` +
        `_To remove this exception, use_ *.dm autoreply reset#*`
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // .dm autoreply reset#  — Remove this chat from exception list
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'reset#') {
      removeFromDmOffList(targetJid);
      const globalActive = getDmAutoReply();
      return reply(
        `🔔 *Exception Removed for This Chat*\n\n` +
        `_This DM will now follow the global setting._\n` +
        `Global Status: ${globalActive ? '🟢 ON (auto reply will be sent here)' : '🔴 OFF (auto reply globally disabled)'}`
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // .dm autoreply message <text>  — Update reply text (owner DM only)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'message') {
      if (!isOwnDM) {
        return reply(
          `⚠️ *Setting the auto reply message must be done in your own (owner) DM.*`
        );
      }
      const newMessage = args.slice(2).join(' ').trim();
      if (!newMessage) {
        return reply(
          `❗ Please provide a message.\n\nExample: *.dm autoreply message Hi! I'll reply soon.*`
        );
      }
      setDmAutoReplyMessage(newMessage);
      const isActive = getDmAutoReply();
      return reply(
        `✅ *Auto Reply Message Updated!*\n\n` +
        `📨 New message:\n_${newMessage}_\n\n` +
        `Global Status: ${isActive ? '🟢 Active' : '🔴 Inactive'}`
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // .dm autoreply status
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'status') {
      const globalActive = getDmAutoReply();
      const currentMsg   = getDmAutoReplyMessage();
      const offList      = getDmOffList();
      const thisChatOff  = isInDmOffList(targetJid);

      if (isOwnDM) {
        const offCount = offList.length;
        return reply(
          `📊 *DM Auto Reply Status (Global)*\n\n` +
          `Global: ${globalActive ? '🟢 Enabled' : '🔴 Disabled'}\n` +
          `Exception list: ${offCount} chat(s) silenced\n\n` +
          `📨 Current message:\n_${currentMsg}_\n\n` +
          `_Run this inside a specific DM to see that chat's exception status._`
        );
      } else {
        return reply(
          `📊 *DM Auto Reply Status for This Chat*\n\n` +
          `Global: ${globalActive ? '🟢 Enabled' : '🔴 Disabled'}\n` +
          `This chat: ${thisChatOff ? '🔕 Silenced (off# active)' : '✅ Following global setting'}\n\n` +
          `📨 Current message:\n_${currentMsg}_`
        );
      }
    }

    // Unknown sub-action
    return reply(
      `❓ Unknown option. Use:\n` +
      `• *.dm autoreply on* — Global enable _(owner DM)_\n` +
      `• *.dm autoreply off* — Global disable _(owner DM)_\n` +
      `• *.dm autoreply off#* — Disable this DM only\n` +
      `• *.dm autoreply reset#* — Remove this DM from exception list\n` +
      `• *.dm autoreply message <text>*\n` +
      `• *.dm autoreply status*`
    );
  }
};
