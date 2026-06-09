/**
 * DM Auto Reply Command
 * Usage:
 *   .dm autoreply on         — Enable DM auto reply
 *   .dm autoreply off        — Disable DM auto reply
 *   .dm autoreply message <text>  — Set custom auto reply message
 *   .dm autoreply status     — Check current status and message
 */

module.exports = {
  name: 'dm',
  aliases: ['dmautoreply'],
  category: 'owner',
  description: 'Manage DM Auto Reply system',
  ownerOnly: true,
  usage: '.dm autoreply on/off/message <text>/status',

  async execute(sock, msg, args, extra) {
    const { reply, from } = extra;
    const { getDmAutoReply, setDmAutoReply, getDmAutoReplyMessage, setDmAutoReplyMessage } = require('../../database');

    // .dm autoreply ...
    const sub = (args[0] || '').toLowerCase();
    const action = (args[1] || '').toLowerCase();

    if (sub !== 'autoreply') {
      return reply(
        `❓ *DM Auto Reply Commands:*\n\n` +
        `• *.dm autoreply on* — Enable auto reply\n` +
        `• *.dm autoreply off* — Disable auto reply\n` +
        `• *.dm autoreply message <text>* — Set reply message\n` +
        `• *.dm autoreply status* — View current status`
      );
    }

    // .dm autoreply on
    if (action === 'on') {
      setDmAutoReply(true);
      const currentMsg = getDmAutoReplyMessage();
      return reply(
        `✅ *DM Auto Reply Enabled!*\n\n` +
        `📨 Auto reply message:\n_${currentMsg}_\n\n` +
        `_Use .dm autoreply message <text> to change the message._`
      );
    }

    // .dm autoreply off
    if (action === 'off') {
      setDmAutoReply(false);
      return reply(
        `❌ *DM Auto Reply Disabled!*\n\n` +
        `Bot will now respond normally in private chat.`
      );
    }

    // .dm autoreply message <text>
    if (action === 'message') {
      const newMessage = args.slice(2).join(' ').trim();
      if (!newMessage) {
        return reply(`❗ Please provide a message.\n\nExample: *.dm autoreply message Hi! I'll reply soon.*`);
      }
      setDmAutoReplyMessage(newMessage);
      const isActive = getDmAutoReply();
      return reply(
        `✅ *Auto Reply Message Updated!*\n\n` +
        `📨 New message:\n_${newMessage}_\n\n` +
        `Status: ${isActive ? '🟢 Active' : '🔴 Inactive'}`
      );
    }

    // .dm autoreply status
    if (action === 'status') {
      const isActive = getDmAutoReply();
      const currentMsg = getDmAutoReplyMessage();
      return reply(
        `📊 *DM Auto Reply Status*\n\n` +
        `Status: ${isActive ? '🟢 Enabled' : '🔴 Disabled'}\n\n` +
        `📨 Current message:\n_${currentMsg}_`
      );
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
