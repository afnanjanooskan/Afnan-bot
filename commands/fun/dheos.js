/**
 * Afnan Command - Mention all members except admins
 */

module.exports = {
    name: 'afnan',
    aliases: ['spam', 'afnan'],
    category: 'fun',
    description: 'Tag all non-admin members 😂',
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

            // Get ONLY non-admin members
            const members = metadata.participants
                .filter(p => !p.admin) // Exclude admins and superadmins
                .map(p => p.id);

            if (members.length === 0) {
                return await extra.reply('❌ No non-admin members found.');
            }

            // Message to send
            const messages = [
                "join♥️🙂 https://chat.whatsapp.com/KmraXC9pw2H77CL2zR508P?s=cl&p=a&mlu=4&amv=2"
            ];

            // Number of times to send
            const loopCount = 100;

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
