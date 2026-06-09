/**
 * WhatsApp MD Bot - Main Entry Point
 */
process.env.PUPPETEER_SKIP_DOWNLOAD = 'true';
process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';
process.env.PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR || '/tmp/puppeteer_cache_disabled';

const { initializeTempSystem } = require('./utils/tempManager');
const { startCleanup } = require('./utils/cleanup');
initializeTempSystem();
startCleanup();
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

const forbiddenPatternsConsole = [
  'closing session',
  'closing open session',
  'sessionentry',
  'prekey bundle',
  'pendingprekey',
  '_chains',
  'registrationid',
  'currentratchet',
  'chainkey',
  'ratchet',
  'signal protocol',
  'ephemeralkeypair',
  'indexinfo',
  'basekey'
];

console.log = (...args) => {
  const message = args.map(a => typeof a === 'string' ? a : typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ').toLowerCase();
  if (!forbiddenPatternsConsole.some(pattern => message.includes(pattern))) {
    originalConsoleLog.apply(console, args);
  }
};

console.error = (...args) => {
  const message = args.map(a => typeof a === 'string' ? a : typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ').toLowerCase();
  if (!forbiddenPatternsConsole.some(pattern => message.includes(pattern))) {
    originalConsoleError.apply(console, args);
  }
};

console.warn = (...args) => {
  const message = args.map(a => typeof a === 'string' ? a : typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ').toLowerCase();
  if (!forbiddenPatternsConsole.some(pattern => message.includes(pattern))) {
    originalConsoleWarn.apply(console, args);
  }
};

// Now safe to load libraries
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const config = require('./config');
const handler = require('./handler');
const database = require('./database');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const os = require('os');

// Remove Puppeteer cache (if some dependency downloaded Chromium into ~/.cache/puppeteer)
function cleanupPuppeteerCache() {
  try {
    const home = os.homedir();
    const cacheDir = path.join(home, '.cache', 'puppeteer');

    if (fs.existsSync(cacheDir)) {
      console.log('🧹 Removing Puppeteer cache at:', cacheDir);
      fs.rmSync(cacheDir, { recursive: true, force: true });
      console.log('✅ Puppeteer cache removed');
    }
  } catch (err) {
    console.error('⚠️ Failed to cleanup Puppeteer cache:', err.message || err);
  }
}
// Optimized in-memory store with hard limits (Map-based for better memory management)
const store = {
  messages: new Map(), // Use Map instead of plain object
  maxPerChat: 20, // Limit to 20 messages per chat

  bind: (ev) => {
    ev.on('messages.upsert', ({ messages }) => {
      for (const msg of messages) {
        if (!msg.key?.id) continue;

        const jid = msg.key.remoteJid;
        if (!store.messages.has(jid)) {
          store.messages.set(jid, new Map());
        }

        const chatMsgs = store.messages.get(jid);
        chatMsgs.set(msg.key.id, msg);

        // Aggressive cleanup per chat - keep only recent messages
        if (chatMsgs.size > store.maxPerChat) {
          // Remove oldest message (first entry in Map)
          const oldestKey = chatMsgs.keys().next().value;
          chatMsgs.delete(oldestKey);
        }
      }
    });
  },

  loadMessage: async (jid, id) => {
    return store.messages.get(jid)?.get(id) || null;
  }
};

// Optimized message deduplication (Set-based, no timestamps needed)
const processedMessages = new Set();

// ── Group Auto Reply: track last sent reply per group (for edit/delete+resend) ──
// Key: groupJid → Value: { id: messageId, fromMe: true }
const garLastReply = new Map();

// Aggressive cleanup - clear every 5 minutes
setInterval(() => {
  processedMessages.clear();
}, 5 * 60 * 1000); // Every 5 minutes

// Custom Pino logger with suppression for Baileys noise
const createSuppressedLogger = (level = 'silent') => {
  const forbiddenPatterns = [
    'closing session',
    'closing open session',
    'sessionentry',
    'prekey bundle',
    'pendingprekey',
    '_chains',
    'registrationid',
    'currentratchet',
    'chainkey',
    'ratchet',
    'signal protocol',
    'ephemeralkeypair',
    'indexinfo',
    'basekey',
    'sessionentry',
    'ratchetkey'
  ];

  let logger;
  try {
    logger = pino({
      level,
      // Fallback transport without pino-pretty (in case not installed)
      transport: process.env.NODE_ENV === 'production' ? undefined : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname'
        }
      },
      customLevels: {
        trace: 0,
        debug: 1,
        info: 2,
        warn: 3,
        error: 4,
        fatal: 5
      },
      // Redact sensitive fields
      redact: ['registrationId', 'ephemeralKeyPair', 'rootKey', 'chainKey', 'baseKey']
    });
  } catch (err) {
    // Fallback to basic pino without transport
    logger = pino({ level });
  }

  // Wrap log methods to filter
  const originalInfo = logger.info.bind(logger);
  logger.info = (...args) => {
    const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ').toLowerCase();
    if (!forbiddenPatterns.some(pattern => msg.includes(pattern))) {
      originalInfo(...args);
    }
  };
  logger.debug = () => { }; // Fully disable debug
  logger.trace = () => { }; // Fully disable trace
  return logger;
};

// Main connection function
async function startBot() {
  const sessionFolder = `./${config.sessionName}`;
  const sessionFile = path.join(sessionFolder, 'creds.json');

  // Check if sessionID is provided and process KnightBot! format session
  if (config.sessionID && config.sessionID.startsWith('KnightBot!')) {
    try {
      const [header, b64data] = config.sessionID.split('!');

      if (header !== 'KnightBot' || !b64data) {
        throw new Error("❌ Invalid session format. Expected 'KnightBot!.....'");
      }

      const cleanB64 = b64data.replace('...', '');
      const compressedData = Buffer.from(cleanB64, 'base64');
      const decompressedData = zlib.gunzipSync(compressedData);

      // Ensure session folder exists
      if (!fs.existsSync(sessionFolder)) {
        fs.mkdirSync(sessionFolder, { recursive: true });
      }

      // Write decompressed session data to creds.json
      fs.writeFileSync(sessionFile, decompressedData, 'utf8');
      console.log('📡 Session : 🔑 Retrieved from KnightBot Session');

    } catch (e) {
      console.error('📡 Session : ❌ Error processing KnightBot session:', e.message);
      // Continue with normal QR flow if session processing fails
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
  const { version } = await fetchLatestBaileysVersion();

  // Use suppressed logger for socket
  const suppressedLogger = createSuppressedLogger('silent');

  const sock = makeWASocket({
    version, // explicit WA Web version negotiated with the server
    logger: suppressedLogger,
    printQRInTerminal: false,
    // Use a common desktop browser signature
    browser: ['Chrome', 'Windows', '10.0'],
    auth: state,
    // Memory optimization: prevent loading old messages into RAM
    syncFullHistory: false,
    downloadHistory: false,
    markOnlineOnConnect: false,
    getMessage: async () => undefined // Don't load messages from store
  });

  // Bind store to socket
  store.bind(sock.ev);

  // Watchdog for inactive socket (Baileys bug fix)
  let lastActivity = Date.now();
  const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  // Update on every message
  sock.ev.on('messages.upsert', () => {
    lastActivity = Date.now();
  });

  // Check every 5 min
  const watchdogInterval = setInterval(async () => {
    if (Date.now() - lastActivity > INACTIVITY_TIMEOUT && sock.ws.readyState === 1) { // WebSocket open but inactive
      console.log('⚠️ No activity detected. Forcing reconnect...');
      await sock.end(undefined, undefined, { reason: 'inactive' });
      clearInterval(watchdogInterval);
      setTimeout(() => startBot(), 5000); // Slightly longer delay
    }
  }, 5 * 60 * 1000); // Every 5 min check

  // Clear on close/open
  sock.ev.on('connection.update', (update) => {
    const { connection } = update;
    if (connection === 'open') {
      lastActivity = Date.now(); // Reset on open
    } else if (connection === 'close') {
      clearInterval(watchdogInterval);
    }
  });

  // Connection update handler
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n\n📱 Scan this QR code with WhatsApp:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const errorMessage = lastDisconnect?.error?.message || 'Unknown error';

      // Suppress verbose error output for common stream errors (515, etc.)
      if (statusCode === 515 || statusCode === 503 || statusCode === 408) {
        console.log(`⚠️ Connection closed (${statusCode}). Reconnecting...`);
      } else {
        console.log('Connection closed due to:', errorMessage, '\nReconnecting:', shouldReconnect);
      }

      if (shouldReconnect) {
        setTimeout(() => startBot(), 3000);
      }
    } else if (connection === 'open') {
      console.log('\n✅ Bot connected successfully!');
      console.log(`📱 Bot Number: ${sock.user.id.split(':')[0]}`);
      console.log(`🤖 Bot Name: ${config.botName}`);
      console.log(`⚡ Prefix: ${config.prefix}`);
      const ownerNames = Array.isArray(config.ownerName) ? config.ownerName.join(',') : config.ownerName;
      console.log(`👑 Owner: ${ownerNames}\n`);
      console.log('Bot is ready to receive messages!\n');

      // Set bot status
      if (config.autoBio) {
        await sock.updateProfileStatus(`${config.botName} | Active 24/7`);
      }

      // Initialize anti-call feature
      handler.initializeAntiCall(sock);

      // Cleanup old chats (keep only active ones, e.g., last touched <1 day)
      const now = Date.now();
      for (const [jid, chatMsgs] of store.messages.entries()) {
        const timestamps = Array.from(chatMsgs.values()).map(m => m.messageTimestamp * 1000 || 0);
        if (timestamps.length > 0 && now - Math.max(...timestamps) > 24 * 60 * 60 * 1000) { // 1 day old chat
          store.messages.delete(jid);
        }
      }
      console.log(`🧹 Store cleaned. Active chats: ${store.messages.size}`);
    }
  });

  // Credentials update handler
  sock.ev.on('creds.update', saveCreds);

  // System JID filter - checks if JID is from broadcast/status/newsletter
  const isSystemJid = (jid) => {
    if (!jid) return true;
    return jid.includes('@broadcast') ||
      jid.includes('status.broadcast') ||
      jid.includes('@newsletter') ||
      jid.includes('@newsletter.');
  };

  // Messages handler - Process only new messages
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    // Only process "notify" type (new messages), skip "append" (old messages from history)
    if (type !== 'notify') return;

    // Process messages in the array
    for (const msg of messages) {
      // Skip if message is invalid or missing key
      if (!msg.message || !msg.key?.id) continue;

      const from = msg.key.remoteJid;
      if (!from) {
        continue;
      }

      // System message filter - ignore broadcast/status/newsletter messages
      if (isSystemJid(from)) {
        continue; // Silently ignore system messages
      }

      // Deduplication: Skip if message has already been processed
      const msgId = msg.key.id;
      if (processedMessages.has(msgId)) continue;

      // Timestamp validation: Only process messages within last 5 minutes
      const MESSAGE_AGE_LIMIT = 5 * 60 * 1000; // 5 minutes in milliseconds
      let messageAge = 0;
      if (msg.messageTimestamp) {
        messageAge = Date.now() - (msg.messageTimestamp * 1000);
        if (messageAge > MESSAGE_AGE_LIMIT) {
          // Message is too old, skip processing
          continue;
        }
      }

      // Mark message as processed
      processedMessages.add(msgId);

      // Store message FIRST (before processing)
      // from already defined above in DM block check
      if (msg.key && msg.key.id) {
        if (!store.messages.has(from)) {
          store.messages.set(from, new Map());
        }
        const chatMsgs = store.messages.get(from);
        chatMsgs.set(msg.key.id, msg);

        // Cleanup: Keep only last 20 per chat (reduced from 200)
        if (chatMsgs.size > store.maxPerChat) {
          // Remove oldest messages
          const sortedIds = Array.from(chatMsgs.entries())
            .sort((a, b) => (a[1].messageTimestamp || 0) - (b[1].messageTimestamp || 0))
            .map(([id]) => id);
          for (let i = 0; i < sortedIds.length - store.maxPerChat; i++) {
            chatMsgs.delete(sortedIds[i]);
          }
        }
      }

      // Process command IMMEDIATELY (don't block on other operations)
      handler.handleMessage(sock, msg).catch(err => {
        if (!err.message?.includes('rate-overlimit') &&
          !err.message?.includes('not-authorized')) {
          console.error('Error handling message:', err.message);
        }
      });

      // ── Group Auto Reply ─────────────────────────────────────────────────
      // Runs inside messages.upsert. IIFE captures msg+from to avoid
      // closure bug. Independent from DM Auto Reply. Groups only.
      ;(async (msg, from) => {
        try {
          // ── Gate 1: Groups only, never bot's own messages ─────────────────
          if (!from || !from.endsWith('@g.us')) return;
          if (msg.key.fromMe) return;

          const sender = msg.key.participant || msg.key.remoteJid;
          if (!sender) return;

          // ── Gate 2: Skip owner ────────────────────────────────────────────
          const ownerNumbers = config.ownerNumber || [];
          const senderNum = sender.split('@')[0].split(':')[0];
          if (ownerNumbers.some(n => n === senderNum)) return;

          // ── Gate 3: Feature enabled? (group override → global) ────────────
          const garActive = database.isGroupAutoReplyActive(from);
          console.log(`[GAR] Group: ${from} | Active: ${garActive} | Sender: ${senderNum}`);
          if (!garActive) return;

          // ── Extract all message content ───────────────────────────────────
          const m = msg.message || {};
          // Unwrap viewOnce / ephemeral wrappers
          const unwrapped = m.viewOnceMessage?.message
            || m.viewOnceMessageV2?.message
            || m.ephemeralMessage?.message
            || m;

          // All possible inner message types
          const ext   = unwrapped.extendedTextMessage      || {};
          const img   = unwrapped.imageMessage             || {};
          const vid   = unwrapped.videoMessage             || {};
          const doc   = unwrapped.documentMessage         || {};
          const aud   = unwrapped.audioMessage             || {};
          const btn   = unwrapped.buttonsResponseMessage   || {};
          const list  = unwrapped.listResponseMessage      || {};

          // ── Body text (all message types) ─────────────────────────────────
          const body = (
            unwrapped.conversation
            || ext.text
            || img.caption
            || vid.caption
            || doc.caption
            || btn.selectedDisplayText
            || list.singleSelectReply?.selectedRowId
            || ''
          ).toLowerCase().trim();

          // ── Bot JID (normalised, no device suffix) ────────────────────────
          const botNumRaw = (sock.user?.id || '').split(':')[0];
          const botJid    = botNumRaw + '@s.whatsapp.net';
          const botLidRaw = (sock.user?.lid || '').split(':')[0];

          // ── Collect mentionedJid from EVERY possible path ─────────────────
          const allMentions = new Set();
          const collectMentions = (obj, depth = 0) => {
            if (!obj || typeof obj !== 'object' || depth > 4) return;
            if (Array.isArray(obj.mentionedJid)) obj.mentionedJid.forEach(j => allMentions.add(j));
            if (obj.contextInfo) collectMentions(obj.contextInfo, depth + 1);
            // groupMentions (WhatsApp @all stores participants here)
            if (Array.isArray(obj.groupMentions)) {
              obj.groupMentions.forEach(gm => {
                if (gm.groupJid) allMentions.add(gm.groupJid);
              });
            }
            for (const [k, v] of Object.entries(obj)) {
              if (v && typeof v === 'object' && k !== 'contextInfo') {
                collectMentions(v, depth + 1);
              }
            }
          };
          collectMentions(unwrapped);
          const mentionedJids = Array.from(allMentions);

          // ── Quoted message info ───────────────────────────────────────────
          const ctxInfo = ext.contextInfo || img.contextInfo || vid.contextInfo
            || doc.contextInfo || unwrapped.contextInfo || {};
          const quotedParticipant = (ctxInfo.participant || '').split('@')[0].split(':')[0];
          const quotedIsBot  = quotedParticipant === botNumRaw
            || (botLidRaw && quotedParticipant === botLidRaw);
          const hasQuotedMsg = !!ctxInfo.quotedMessage;

          // ── TRIGGER CHECKS ────────────────────────────────────────────────

          // A. Bot directly mentioned via @tag
          const botMentioned = mentionedJids.some(jid => {
            const n = jid.split('@')[0].split(':')[0];
            return n === botNumRaw || (botLidRaw && n === botLidRaw);
          });

          // B. Any owner number mentioned
          const ownerMentioned = mentionedJids.some(jid =>
            ownerNumbers.includes(jid.split('@')[0].split(':')[0])
          );

          // C/D. @all or @everyone typed literally
          const allTagUsed = body.includes('@all') || body.includes('@everyone');

          // F. Someone replied to a bot message
          const quotedBot = hasQuotedMsg && quotedIsBot;

          // E. Admin mass mention / tagall (≥ half the group tagged)
          let adminMassMention = false;
          if (!botMentioned && !ownerMentioned && !allTagUsed && !quotedBot
              && mentionedJids.length >= 5) {
            try {
              const meta = await sock.groupMetadata(from);
              const total = meta.participants?.length || 0;
              if (total > 0 && mentionedJids.length >= Math.floor(total / 2)) {
                const sp = meta.participants.find(p =>
                  p.id.split('@')[0].split(':')[0] === senderNum
                );
                if (sp?.admin) adminMassMention = true;
              }
            } catch (_) {}
          }

          console.log(`[GAR] botMentioned:${botMentioned} ownerMentioned:${ownerMentioned} allTag:${allTagUsed} quotedBot:${quotedBot} massMention:${adminMassMention} | mentions:[${mentionedJids.join(',')}]`);

          const shouldReply = botMentioned || ownerMentioned || allTagUsed
            || quotedBot || adminMassMention;

          if (!shouldReply) {
            console.log(`[GAR] No trigger matched — skipping.`);
            return;
          }

          // ── Send / Edit / Replace ─────────────────────────────────────────
          const replyText  = database.getGroupAutoReplyMessage();
          const editMode   = database.getGroupAutoReplyEditMode();
          const prevKey    = garLastReply.get(from);

          console.log(`[GAR] Sending reply to ${from} | editMode:${editMode} | prevKey:${prevKey?.id || 'none'}`);

          if (editMode && prevKey) {
            // ── EDIT MODE ON: try to edit previous message ─────────────────
            try {
              const editResult = await sock.sendMessage(from, {
                text: replyText,
                edit: prevKey
              });
              if (editResult?.key) garLastReply.set(from, editResult.key);
              console.log(`[GAR] Edited previous message successfully.`);
              return;
            } catch (editErr) {
              // Editing failed (unsupported or message too old) — fall through to send fresh
              console.log(`[GAR] Edit failed (${editErr.message}) — sending fresh reply instead.`);
              // Clean up stale key so we don't keep trying to edit it
              garLastReply.delete(from);
            }
          }

          // ── EDIT MODE OFF (or edit failed): always send a fresh reply ─────
          // Never use 'edit' here — always quoted reply to triggering message
          const sent = await sock.sendMessage(from, {
            text: replyText
          }, { quoted: msg });

          if (sent?.key) {
            // Only store key if edit mode is ON (so next trigger can edit it)
            if (editMode) {
              garLastReply.set(from, sent.key);
              console.log(`[GAR] Sent fresh reply (stored for future edit). msgId: ${sent.key.id}`);
            } else {
              // Edit mode OFF — clear any stored key so we never try to edit
              garLastReply.delete(from);
              console.log(`[GAR] Sent fresh reply (edit mode OFF). msgId: ${sent.key.id}`);
            }
          }

        } catch (e) {
          console.error(`[GAR] Error:`, e.message);
        }
      })(msg, from);

      // Do other operations in background (non-blocking)
      setImmediate(async () => {
        if (config.autoRead && from.endsWith('@g.us')) {
          try {
            await sock.readMessages([msg.key]);
          } catch (e) {
            // Silently handle
          }
        }
        // NOTE: handleAntilink is called inside handleMessage — removed duplicate call here
      });
    }
  });

  // Message receipt updates (silently handled, no logging)
  sock.ev.on('message-receipt.update', () => {
    // Silently handle receipt updates
  });

  // Message updates (silently handled, no logging)
  sock.ev.on('messages.update', () => {
    // Silently handle message updates
  });

  // Group participant updates (join/leave)
  sock.ev.on('group-participants.update', async (update) => {
    await handler.handleGroupUpdate(sock, update);
  });

  // Handle errors - suppress common stream errors
  sock.ev.on('error', (error) => {
    const statusCode = error?.output?.statusCode;
    // Suppress verbose output for common stream errors
    if (statusCode === 515 || statusCode === 503 || statusCode === 408) {
      // These are usually temporary connection issues, handled by reconnection
      return;
    }
    console.error('Socket error:', error.message || error);
  });

  return sock;
}
// Start the bot
console.log('🚀 Starting WhatsApp MD Bot...\n');
console.log(`📦 Bot Name: ${config.botName}`);
console.log(`⚡ Prefix: ${config.prefix}`);
const ownerNames = Array.isArray(config.ownerName) ? config.ownerName.join(',') : config.ownerName;
console.log(`👑 Owner: ${ownerNames}\n`);

// Proactively delete Puppeteer cache so it doesn't fill disk on panels
cleanupPuppeteerCache();

startBot().catch(err => {
  console.error('Error starting bot:', err);
  process.exit(1);
});
// Handle process termination
process.on('uncaughtException', (err) => {
  // Handle ENOSPC errors gracefully without crashing
  if (err.code === 'ENOSPC' || err.errno === -28 || err.message?.includes('no space left on device')) {
    console.error('⚠️ ENOSPC Error: No space left on device. Attempting cleanup...');
    const { cleanupOldFiles } = require('./utils/cleanup');
    cleanupOldFiles();
    console.warn('⚠️ Cleanup completed. Bot will continue but may experience issues until space is freed.');
    return; // Don't crash, just log and continue
  }
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (err) => {
  // Handle ENOSPC errors gracefully
  if (err.code === 'ENOSPC' || err.errno === -28 || err.message?.includes('no space left on device')) {
    console.warn('⚠️ ENOSPC Error in promise: No space left on device. Attempting cleanup...');
    const { cleanupOldFiles } = require('./utils/cleanup');
    cleanupOldFiles();
    console.warn('⚠️ Cleanup completed. Bot will continue but may experience issues until space is freed.');
    return; // Don't crash, just log and continue
  }

  // Don't spam console with rate limit errors
  if (err.message && err.message.includes('rate-overlimit')) {
    console.warn('⚠️ Rate limit reached. Please slow down your requests.');
    return;
  }
  console.error('Unhandled Rejection:', err);
});
// Export store for use in commands
module.exports = { store };