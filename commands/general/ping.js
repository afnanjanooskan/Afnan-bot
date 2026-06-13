/**
 * Ping Command - Check bot response time
 */

module.exports = {
    name: 'ping',
    aliases: ['p'],
    category: 'general',
    description: 'Check bot response time',
    usage: '.ping',

    async execute(sock, msg, args, extra) {
        try {
            const start = Date.now();

            const sent = await extra.reply('🏓 Pinging...');

            const end = Date.now();
            const responseTime = end - start;

            // Random emoji for each ping
            const emojis = [
                '🍒', '🍓', '🍎', '🍇', '🍉',
                '🍑', '🥭', '🍍', '🍋', '🥝',
                '⚡', '🚀', '🔥', '💎', '🎯'
            ];

            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

            await sock.sendMessage(extra.from, {
                text: `*${randomEmoji} ₰𝐏᪵͢๏ؖ۬֟ȵɠ☞ ${responseTime} 𝖒ˢ*`,
                edit: sent.key
            });

        } catch (error) {
            await extra.reply(`❌ Error: ${error.message}`);
        }
    }
};
