/**
 * Spam Command - Mention only non-admin members
 */

module.exports = {
  name: 'spam',
  aliases: ['spam'],
  category: 'fun',
  description: 'Tag all non-admin members 😂',
  ownerOnly: true,
  usage: '.spam',

  async execute(sock, msg, args, extra) {
    try {
      // Get group metadata
      const metadata = await sock.groupMetadata(msg.key.remoteJid);

      // Get ONLY non-admin members
      const members = metadata.participants
        .filter(p => !p.admin)
        .map(p => p.id);

      // Messages list
      const messages = [
        'https://chat.whatsapp.com/EVf7FOtqRkYKCe4VSz2VQ1?s=cl&p=a&ilr=1&amv=2'
      ];

      // Loop count
      const loopCount = 20;

      // Send messages repeatedly
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
      console.log(error);
      await extra.reply(`❌ Error: ${error.message}`);
    }
  }
};
