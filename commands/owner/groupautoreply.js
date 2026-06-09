/**
 * Group Auto Reply — Owner Command (DM only for global controls)
 *
 * From OWNER DM:
 *   .groupautoreply on                  — Enable globally for all groups
 *   .groupautoreply off                 — Disable globally for all groups
 *   .groupautoreply message <text>      — Set the auto reply message
 *   .groupautoreply status              — Show global status + message
 *   .groupautoreply reset <groupId>     — Reset a specific group's override
 *
 * From INSIDE A GROUP (any admin or owner):
 *   .groupautoreply on                  — Enable only for this group (override)
 *   .groupautoreply off                 — Disable only for this group (override)
 *   .groupautoreply status              — Show this group's effective status
 *   .groupautoreply reset               — Remove this group's override (follow global)
 */

module.exports = {
  name: 'groupautoreply',
  aliases: ['gar'],
  category: 'owner',
  description: 'Manage Group Auto Reply system',
  ownerOnly: false,   // Handled manually below — owner in DM, admin in group
  usage: '.groupautoreply on/off/message <text>/status/reset',

  async execute(sock, msg, args, extra) {
    const { reply, from, isGroup, sender } = extra;
    const {
      getGroupAutoReply,
      setGroupAutoReply,
      getGroupAutoReplyMessage,
      setGroupAutoReplyMessage,
      isGroupAutoReplyActive,
      setGroupAutoReplyOverride,
    } = require('../../database');
    const config = require('../../config');

    const isOwner = () =>
      config.ownerNumber.some(n => sender.includes(n));

    const action = (args[0] || '').toLowerCase();

    // ── INSIDE A GROUP ────────────────────────────────────────────────────────
    if (isGroup) {
      // Allow owner OR group admin to use in-group controls
      const { isAdmin, isBotAdmin } = require('../../handler');
      const senderIsOwner = isOwner();
      const senderIsAdmin = await isAdmin(sock, sender, from, null);

      if (!senderIsOwner && !senderIsAdmin) {
        return reply('🚫 Only the bot owner or group admins can use this command.');
      }

      if (action === 'on') {
        setGroupAutoReplyOverride(from, true);
        return reply(
          `✅ *Group Auto Reply — Enabled for this group!*\n\n` +
          `📨 Reply message:\n_${getGroupAutoReplyMessage()}_\n\n` +
          `_This group will always auto reply even if global setting is OFF._`
        );
      }

      if (action === 'off') {
        setGroupAutoReplyOverride(from, false);
        return reply(
          `❌ *Group Auto Reply — Disabled for this group!*\n\n` +
          `_This group will not auto reply even if global setting is ON._`
        );
      }

      if (action === 'reset') {
        setGroupAutoReplyOverride(from, null);
        const globalStatus = getGroupAutoReply();
        return reply(
          `🔄 *Group Auto Reply — Reset to global setting!*\n\n` +
          `Global setting is currently: ${globalStatus ? '🟢 ON' : '🔴 OFF'}\n` +
          `This group will now follow the global setting.`
        );
      }

      if (action === 'status') {
        const effective = isGroupAutoReplyActive(from);
        const globalOn = getGroupAutoReply();
        const { getGroupSettings } = require('../../database');
        const settings = getGroupSettings(from);
        const override = settings.groupAutoReplyOverride;
        return reply(
          `📊 *Group Auto Reply Status*\n\n` +
          `🌐 Global setting: ${globalOn ? '🟢 ON' : '🔴 OFF'}\n` +
          `🏠 This group override: ${override === null ? '➖ None (follows global)' : override ? '🟢 Forced ON' : '🔴 Forced OFF'}\n` +
          `✅ Effective status: ${effective ? '🟢 Active' : '🔴 Inactive'}\n\n` +
          `📨 Reply message:\n_${getGroupAutoReplyMessage()}_`
        );
      }

      return reply(
        `❓ *Group Auto Reply Commands (in-group):*\n\n` +
        `• *.groupautoreply on* — Enable for this group\n` +
        `• *.groupautoreply off* — Disable for this group\n` +
        `• *.groupautoreply reset* — Follow global setting\n` +
        `• *.groupautoreply status* — View status`
      );
    }

    // ── OWNER DM ──────────────────────────────────────────────────────────────
    if (!isOwner()) {
      return reply('👑 Only the bot owner can manage Group Auto Reply from DM.');
    }

    if (action === 'on') {
      setGroupAutoReply(true);
      return reply(
        `✅ *Group Auto Reply — Globally Enabled!*\n\n` +
        `📨 Reply message:\n_${getGroupAutoReplyMessage()}_\n\n` +
        `Bot will auto reply in ALL groups when mentioned or @all is used.\n` +
        `_(Groups with a local OFF override are not affected.)_\n\n` +
        `_Use .groupautoreply message <text> to change the reply._`
      );
    }

    if (action === 'off') {
      setGroupAutoReply(false);
      return reply(
        `❌ *Group Auto Reply — Globally Disabled!*\n\n` +
        `Bot will not auto reply in groups (unless a group has a local ON override).`
      );
    }

    if (action === 'message') {
      const newMessage = args.slice(1).join(' ').trim();
      if (!newMessage) {
        return reply(`❗ Please provide a message.\n\nExample: *.groupautoreply message Hi! You called?*`);
      }
      setGroupAutoReplyMessage(newMessage);
      const active = getGroupAutoReply();
      return reply(
        `✅ *Group Auto Reply Message Updated!*\n\n` +
        `📨 New message:\n_${newMessage}_\n\n` +
        `Global status: ${active ? '🟢 ON' : '🔴 OFF'}`
      );
    }

    if (action === 'status') {
      const active = getGroupAutoReply();
      const msg2 = getGroupAutoReplyMessage();
      return reply(
        `📊 *Group Auto Reply — Global Status*\n\n` +
        `Status: ${active ? '🟢 Enabled' : '🔴 Disabled'}\n\n` +
        `📨 Current message:\n_${msg2}_\n\n` +
        `_Tip: Use .groupautoreply on/off inside a group to override per-group._`
      );
    }

    // Help
    return reply(
      `❓ *Group Auto Reply Commands:*\n\n` +
      `*From your DM (global):*\n` +
      `• *.groupautoreply on* — Enable for all groups\n` +
      `• *.groupautoreply off* — Disable for all groups\n` +
      `• *.groupautoreply message <text>* — Change reply message\n` +
      `• *.groupautoreply status* — View global status\n\n` +
      `*From inside a group:*\n` +
      `• *.groupautoreply on* — Enable only for this group\n` +
      `• *.groupautoreply off* — Disable only for this group\n` +
      `• *.groupautoreply reset* — Follow global setting\n` +
      `• *.groupautoreply status* — View this group's status`
    );
  }
};
