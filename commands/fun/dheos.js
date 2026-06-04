/**
 * Afnan Command - Mention all members (Admins + Members)
 */

module.exports = {
  name: 'afnan',
  aliases: ['spam', 'afnan'],
  category: 'fun',
  description: 'Tag all members 😂',
  ownerOnly: true,
  usage: '.afnan',

  async execute(sock, msg, args, extra) {
    try {
      // Check if command is used in a group
      if (!msg.key.remoteJid.endsWith('@g.us')) {
        return await extra.reply('❌ This command can only be used in groups.');
      }

      // Get group metadata
      const metadata = await sock.groupMetadata(msg.key.remoteJid);

      // Get ALL members (including admins)
      const members = metadata.participants.map(p => p.id);

      // Message to send
      const text = "I know you will be shocked. It's me, Afnan 😎";

      // Send message and mention everyone
      await sock.sendMessage(
        msg.key.remoteJid,
        {
          text,
          mentions: members
        }
      );

    } catch (error) {
      console.error(error);
      await extra.reply(`❌ Error: ${error.message}`);
    }
  }
};
