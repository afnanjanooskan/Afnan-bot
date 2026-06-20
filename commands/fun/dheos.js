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

      // Messages list
      const messages = [
        "guys start the Voice chat let's practice the English ☺️"
      ];

      // Number of times to send
      const loopCount = 1;

      // Send messages
      for (let i = 0; i < loopCount; i++) {
        for (const text of messages) {
          await sock.sendMessage(
            msg.key.remoteJid,
            {
              text,
              mentions: members
            }
          );
        }
      }

    } catch (error) {
      console.error(error);
      await extra.reply(`❌ Error: ${error.message}`);
    }
  }
};
