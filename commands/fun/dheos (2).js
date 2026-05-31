/**

 * Dheos / Amel Command - Fun roast command

 */

module.exports = {

  name: 'dheos',

  aliases: ['Afnan'],

  category: 'fun',

  description: 'Tag all admins + members 😂',
    ownerOnly:
    true,

  usage: '.Afnan',

  async execute(sock, msg, args, extra) {

    try {

      // Get group metadata

      const metadata = await sock.groupMetadata(msg.key.remoteJid);

      // Get ALL members including admins

      const members = metadata.participants.map(p => p.id);

      // Messages list

      const messages = [

        'hi'

      ];

      // Loop count

      const loopCount = 1;

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