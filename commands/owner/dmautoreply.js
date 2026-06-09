/**
 * DM Auto Reply Command
 *
 * Context-aware behaviour:
 *   • Run inside a specific USER's DM  → applies only to that user
 *   • Run inside the OWNER's own DM    → applies globally to all DMs
 *
 * Usage:
 *   .dm autoreply on           — Enable auto reply (scope depends on chat)
 *   .dm autoreply off          — Disable auto reply (scope depends on chat)
 *   .dm autoreply message <t>  — Set custom auto reply message (always global)
 *   .dm autoreply status       — Show current status
 */

module.exports = {
  name: 'dm',
  aliases: ['dmautoreply'],
  category: 'owner',
  description: 'Manage DM Auto Reply system',
  ownerOnly: true,
  usage: '.dm autoreply on/off/message <text>/status',

  async execute(sock, msg, args, extra) {
    const { reply, from, sender } = extra;
    const {
      getDmAutoReply,
      setDmAutoReply,
      getDmAutoReplyMessage,
      setDmAutoReplyMessage,
      getDmAutoReplyOverride,
      setDmAutoReplyOverride,
    } = require('../../database');

    const config = require('../../config');

    const sub    = (args[0] || '').toLowerCase();
    const action = (args[1] || '').toLowerCase();

    if (sub !== 'autoreply') {
      return reply(
        `❓ *DM Auto Reply Commands:*\n\n` +
        `• *.dm autoreply on* — Enable auto reply\n` +
        `• *.dm autoreply off* — Disable auto reply\n` +
        `• *.dm autoreply message <text>* — Set reply message\n` +
        `• *.dm autoreply status* — View current status\n\n` +
        `_Run in a specific user's DM to apply only to that user._\n` +
        `_Run in your own DM to apply globally._`
      );
    }

    // ── Detect scope ──────────────────────────────────────────────────────────
    // "from" in a DM is the other person's JID (or owner's own number for self-DMs).
    // We compare it against the owner numbers to decide global vs per-user.
    const ownerNumbers = config.ownerNumber || [];
    const fromNumber   = String(from).split('@')[0];
    const isOwnDM      = ownerNumbers.some(
      (n) => String(n).replace(/[^0-9]/g, '') === fromNumber.replace(/[^0-9]/g, '')
    );

    // The target user JID (only relevant when NOT in own DM)
    const targetJid = from; // DM `from` is always the other person's JID

    // ── .dm autoreply on ──────────────────────────────────────────────────────
    if (action === 'on') {
      if (isOwnDM) {
        setDmAutoReply(true);
        const currentMsg = getDmAutoReplyMessage();
        return reply(
          `✅ *DM Auto Reply Enabled Globally!*\n\n` +
          `📨 Auto reply message:\n_${currentMsg}_\n\n` +
          `_Applies to ALL private chats._\n` +
          `_Use .dm autoreply message <text> to change the message._`
        );
      } else {
        setDmAutoReplyOverride(targetJid, true);
        return reply(
          `✅ *DM Auto Reply Enabled for this chat!*\n\n` +
          `_Auto reply is now ON specifically for *${fromNumber}*._\n` +
          `_This overrides the global setting for this user._`
        );
      }
    }

    // ── .dm autoreply off ─────────────────────────────────────────────────────
    if (action === 'off') {
      if (isOwnDM) {
        setDmAutoReply(false);
        return reply(
          `❌ *DM Auto Reply Disabled Globally!*\n\n` +
          `_Bot will respond normally in ALL private chats._\n` +
          `_(Per-user overrides that are ON will still fire.)_`
        );
      } else {
        setDmAutoReplyOverride(targetJid, false);
        return reply(
          `❌ *DM Auto Reply Disabled for this chat!*\n\n` +
          `_Auto reply is now OFF specifically for *${fromNumber}*._\n` +
          `_This overrides the global setting for this user._`
        );
      }
    }

    // ── .dm autoreply message <text> ──────────────────────────────────────────
    if (action === 'message') {
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

    // ── .dm autoreply status ──────────────────────────────────────────────────
    if (action === 'status') {
      const globalActive = getDmAutoReply();
      const currentMsg   = getDmAutoReplyMessage();

      if (isOwnDM) {
        return reply(
          `📊 *DM Auto Reply Status (Global)*\n\n` +
          `Global: ${globalActive ? '🟢 Enabled' : '🔴 Disabled'}\n\n` +
          `📨 Current message:\n_${currentMsg}_\n\n` +
          `_Run this command inside a specific user's DM to see their override._`
        );
      } else {
        const override = getDmAutoReplyOverride(targetJid);
        let overrideLine;
        if (override === true)  overrideLine = '🟢 Forced ON (overrides global)';
        else if (override === false) overrideLine = '🔴 Forced OFF (overrides global)';
        else overrideLine = `⚪ No override (follows global: ${globalActive ? '🟢 ON' : '🔴 OFF'})`;

        return reply(
          `📊 *DM Auto Reply Status for ${fromNumber}*\n\n` +
          `This user: ${overrideLine}\n` +
          `Global: ${globalActive ? '🟢 Enabled' : '🔴 Disabled'}\n\n` +
          `📨 Current message:\n_${currentMsg}_`
        );
      }
    }

    // Unknown sub-action
    return reply(
      `❓ Unknown option. Use:\n` +
      `• *.dm autoreply on*\n` +
      `• *.dm autoreply off*\n` +
      `• *.dm autoreply message <text>*\n` +
      `• *.dm autoreply status*`
    );
  }
};
