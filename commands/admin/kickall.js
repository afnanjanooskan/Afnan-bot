module.exports = {
name: 'kickall',
aliases: ['removeall'],
category: 'admin',
description: 'Kick all non-admin members',
ownerOnly: true,

async execute(sock, msg, args, {
    from,
    isGroup,
    groupMetadata,
    isAdmin,
    isBotAdmin,
    isOwner,
    reply,
    react
}) {
    try {

        if (!isGroup) {
            return reply('❌ This command only works in groups.');
        }

        if (!isAdmin && !isOwner) {
            return reply('❌ Only admins can use this command.');
        }

        if (!isBotAdmin) {
            return reply('❌ Bot must be admin.');
        }

        await react('⚠️');

        const participants = groupMetadata?.participants || [];
        const config = require('../../config');

        // Protected users
        const protectedUsers = [];

        // Protect bot
        if (sock.user?.id) {
            protectedUsers.push(
                sock.user.id.split(':')[0] + '@s.whatsapp.net'
            );
        }

        // Protect owners
        if (Array.isArray(config.ownerNumber)) {
            config.ownerNumber.forEach(num => {
                protectedUsers.push(
                    num.includes('@')
                        ? num
                        : num + '@s.whatsapp.net'
                );
            });
        }

        // Users to remove
        const usersToKick = participants
            .filter(p => {
                if (p.admin) return false;
                if (protectedUsers.includes(p.id)) return false;
                return true;
            })
            .map(p => p.id);

        if (usersToKick.length === 0) {
            return reply('⚠️ No users to remove.');
        }

        let removed = 0;

        // Remove one by one
        for (const user of usersToKick) {
            try {
                await sock.groupParticipantsUpdate(
                    from,
                    [user],
                    'remove'
                );
                removed++;
            } catch (err) {
                console.log(`Failed to remove ${user}`, err);
            }
        }

        await react('✅');

        return reply(
            `✅ Removed ${removed}/${usersToKick.length} member(s) successfully.`
        );

    } catch (err) {
        console.error('KickAll Error:', err);
        return reply(`❌ Failed: ${err.message}`);
    }
}

};
