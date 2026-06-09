/**
 * Group Auto Reply — Settings Command
 *
 * From OWNER DM (global controls):
 *   .groupautoreply on                 — Enable globally for all groups
 *   .groupautoreply off                — Disable globally for all groups
 *   .groupautoreply message <text>     — Set custom auto reply message
 *   .groupautoreply status             — Show global status + message
 *
 * From INSIDE A GROUP (owner or group admin):
 *   .groupautoreply on                 — Force ON for this group only
 *   .groupautoreply off                — Force OFF for this group only
 *   .groupautoreply reset              — Remove override, follow global
 *   .groupautoreply status             — Show effective status for this group
 *
 * NOTE: Actual auto reply logic lives in index.js (messages.upsert).
 *       This file only manages settings stored in config.js / database.
 */

module.exports = {
  name: 'groupautoreply',
  aliases: ['gar'],
  category: 'owner',
  description: 'Manage Group Auto Reply system',
  ownerOnly: false, // access controlled manually below
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
      getGroupSettings,
    } = require('../../database');

    const config = require('../../config');

    const senderNum = sender.split('@')[0].split(':')[0];
    const ownerNumbers = config.ownerNumber || [];
    const senderIsOwner = ownerNumbers.includes(senderNum);

    const action = (args[0] || '').toLowerCase();

    // ── INSIDE A GROUP ────────────────────────────────────────────────────────
    if (isGroup) {
      // Allow owner OR group admin
      const { isAdmin } = require('../../handler');
      const senderIsAdmin = await isAdmin(sock, sender, from, null);

      if (!senderIsOwner && !senderIsAdmin) {
        return reply('🚫 Only the bot owner or group admins can use this command.');
      }

      if (action === 'on') {
        setGroupAutoReplyOverride(from, true);
        return reply(
          `✅ *Group Auto Reply — Enabled for this group!*\n\n` +
          `📨 Reply message:\n_${getGroupAutoReplyMessage()}_\n\n` +
          `_This group will auto reply even if global setting is OFF._`
        );
      }

      if (action === 'off') {
        setGroupAutoReplyOverride(from, false);
        return reply(
          `❌ *Group Auto Reply — Disabled for this group!*\n\n` +
          `_This group will NOT auto reply even if global setting is ON._`
        );
      }

      if (action === 'reset') {
        setGroupAutoReplyOverride(from, null);
        const globalOn = getGroupAutoReply();
        return reply(
          `🔄 *Group Auto Reply — Reset to global setting!*\n\n` +
          `Global is currently: ${globalOn ? '🟢 ON' : '🔴 OFF'}\n` +
          `This group now follows the global setting.`
        );
      }

      if (action === 'status') {
        const settings = getGroupSettings(from);
        const override = settings.groupAutoReplyOverride;
        const globalOn = getGroupAutoReply();
        const effective = isGroupAutoReplyActive(from);
        return reply(
          `📊 *Group Auto Reply Status*\n\n` +
          `🌐 Global: ${globalOn ? '🟢 ON' : '🔴 OFF'}\n` +
          `🏠 This group override: ${
            override === null || override === undefined
              ? '➖ None (follows global)'
              : override ? '🟢 Forced ON' : '🔴 Forced OFF'
          }\n` +
          `✅ Effective: ${effective ? '🟢 Active' : '🔴 Inactive'}\n\n` +
          `📨 Reply message:\n_${getGroupAutoReplyMessage()}_`
        );
      }

      return reply(
        `❓ *Group Auto Reply (in-group):*\n\n` +
        `• *.groupautoreply on* — Enable for this group\n` +
        `• *.groupautoreply off* — Disable for this group\n` +
        `• *.groupautoreply reset* — Follow global setting\n` +
        `• *.groupautoreply status* — View status`
      );
    }

    // ── OWNER DM ──────────────────────────────────────────────────────────────
    if (!senderIsOwner) {
      return reply('👑 Only the bot owner can manage Group Auto Reply from DM.');
    }

    if (action === 'on') {
      setGroupAutoReply(true);
      return reply(
        `✅ *Group Auto Reply — Globally Enabled!*\n\n` +
        `📨 Reply message:\n_${getGroupAutoReplyMessage()}_\n\n` +
        `Bot will auto reply in ALL groups when:\n` +
        `• Bot is mentioned/tagged\n` +
        `• Owner is mentioned/tagged\n` +
        `• @all or @everyone is used\n` +
        `• Admin uses mass mentions\n\n` +
        `_Groups with a local OFF override are excluded._`
      );
    }

    if (action === 'off') {
      setGroupAutoReply(false);
      return reply(
        `❌ *Group Auto Reply — Globally Disabled!*\n\n` +
        `Bot will not auto reply in groups.\n` +
        `_(Groups with a local ON override will still reply.)_`
      );
    }

    if (action === 'message') {
      const newMessage = args.slice(1).join(' ').trim();
      if (!newMessage) {
        return reply(`❗ Please provide a message.\n\nExample:\n*.groupautoreply message Hi! You called?*`);
      }
      setGroupAutoReplyMessage(newMessage);
      return reply(
        `✅ *Auto Reply Message Updated!*\n\n` +
        `📨 New message:\n_${newMessage}_\n\n` +
        `Global status: ${getGroupAutoReply() ? '🟢 ON' : '🔴 OFF'}`
      );
    }

    if (action === 'status') {
      return reply(
        `📊 *Group Auto Reply — Global Status*\n\n` +
        `Status: ${getGroupAutoReply() ? '🟢 Enabled' : '🔴 Disabled'}\n\n` +
        `📨 Current message:\n_${getGroupAutoReplyMessage()}_\n\n` +
        `_Tip: Use .groupautoreply on/off inside a group to set a per-group override._`
      );
    }

    return reply(
      `❓ *Group Auto Reply Commands:*\n\n` +
      `*From your DM (global):*\n` +
      `• *.groupautoreply on* — Enable for all groups\n` +
      `• *.groupautoreply off* — Disable for all groups\n` +
      `• *.groupautoreply message <text>* — Change reply message\n` +
      `• *.groupautoreply status* — View global status\n\n` +
      `*From inside a group:*\n` +
      `• *.groupautoreply on* — Force ON for this group\n` +
      `• *.groupautoreply off* — Force OFF for this group\n` +
      `• *.groupautoreply reset* — Follow global setting\n` +
      `• *.groupautoreply status* — View this group's status`
    );
  }
};
