const TelegramBot = require("node-telegram-bot-api");
const path = require("path");
const fs = require("fs");
const { createSelfOutputGuard } = require("./telegramSelfGuard");

const pairingSessions = new Map();
const pairCooldown = new Map();
const pairingFinalized = new Set();
const PAIR_COOLDOWN_MS = 30_000;
const BRAND = "𝑿 𝑵𝑶𝑩𝑰𝑻𝑨 𝑴𝑶𝑫𝒁";
const START_PHOTO = path.join(process.cwd(), "telegram_start.jpg");
const OFFICIAL_PAIR_GROUP_ID = "-1004416590954";
const OFFICIAL_PAIR_GROUP_LINK = "https://t.me/x_nobita_xd_pair";

// Telegram Bot Token: paste your BotFather token here.
// Environment variable is supported too; the value below is used if it is set.
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8987761479:AAGYsiWPIFTPSJMyLNv124RqKcTsQcJ-Es4";

function normalizePhone(value) { return String(value || "").replace(/\D/g, ""); }
function isoToFlag(iso) {
  const code = String(iso || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🌍";
  return String.fromCodePoint(...[...code].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65));
}
function safeSessionId(phone) { return normalizePhone(phone); }
function maskPhone(phone) { const value = String(phone || ""); return value.length > 2 ? `${value.slice(0, 2)}*********` : value; }
function formatPairingCode(value) { const raw = String(value || "").replace(/\s+/g, ""); return raw.match(/.{1,4}/g)?.join("-") || raw; }

const startText = `💗 𝐖ᴇʟᴄᴏᴍᴇ 𝐓ᴏ 𝐗 Nᴏʙɪᴛᴀ Mᴏᴅᴢ

🌷 𝐂ᴏɴɴᴇᴄᴛ 𝐘ᴏᴜʀ 𝐖ʜᴀᴛsAᴘᴘ

📱 𝐔sᴇ:
➜ /pair 𝟿𝟷XXXXXXXXXX

❤️‍🩹 𝐏ᴏᴡᴇʀᴇᴅ 𝐁ʏ 𝐗 Nᴏʙɪᴛᴀ`;
function startingText(phone) { return `💗 𝐒ᴛᴀʀᴛɪɴɢ 𝐏ᴀɪʀɪɴɢ\n\n📱 ${maskPhone(phone)}\n⏳ 𝐏ʟᴇᴀsᴇ 𝐖ᴀɪᴛ...`; }
function codeText(code) { return `💗 𝐏ᴀɪʀɪɴɢ 𝐂ᴏᴅᴇ\n\n🔐 𝐂ᴏᴅᴇ: ${formatPairingCode(code)}\n⏳ 𝐄xᴘɪʀᴇs 𝐈ɴ: 𝟿𝟶 𝐒ᴇᴄᴏɴᴅs\n⚠️ 𝐃ᴏ 𝐍ᴏᴛ 𝐒ʜᴀʀᴇ 𝐓ʜᴇ 𝐂ᴏᴅᴇ\n\n🌷 𝐗 Nᴏʙɪᴛᴀ Mᴏᴅᴢ`; }
const successText = `❤️‍🩹 𝐂ᴏɴɴᴇᴄᴛᴇᴅ 𝐒ᴜᴄᴄᴇssғᴜʟʟʏ\n\n💚 𝐖ʜᴀᴛsAᴘᴘ: 𝐎ɴʟɪɴᴇ\n✨ 𝐘ᴏᴜʀ 𝐁ᴏᴛ 𝐈s 𝐑ᴇᴀᴅʏ`;
function failedText(phone) { return `💔 𝐏ᴀɪʀɪɴɢ 𝐅ᴀɪʟᴇᴅ\n\n📱 ${maskPhone(phone)}\n🥀 𝐑ᴇᴀsᴏɴ: 𝐏ᴀɪʀɪɴɢ 𝐅ᴀɪʟᴇᴅ\n\n🔄 𝐏ʟᴇᴀsᴇ 𝐓ʀʏ 𝐀ɢᴀɪɴ\n➜ /pair ${maskPhone(phone)}`; }
function expiredText(phone) { return `🥀 𝐏ᴀɪʀɪɴɢ 𝐂ᴏᴅᴇ 𝐄xᴘɪʀᴇᴅ\n\n📱 ${maskPhone(phone)}\n⏳ 𝐓ʜᴇ 𝐂ᴏᴅᴇ 𝐈s 𝐍ᴏ 𝐋ᴏɴɢᴇʀ 𝐕ᴀʟɪᴅ\n\n🔄 𝐓ʀʏ 𝐀ɢᴀɪɴ\n➜ /pair ${maskPhone(phone)}`; }
function statusText(manager) {
  const sessions = manager?.sessions instanceof Map ? [...manager.sessions.values()].filter(s => s?.status === "connected").length : 0;
  const uptime = Math.floor(process.uptime());
  const days = Math.floor(uptime / 86400); const hours = Math.floor((uptime % 86400) / 3600); const mins = Math.floor((uptime % 3600) / 60);
  return `❤️‍🩹 𝐁ᴏᴛ 𝐒ᴛᴀᴛᴜs\n\n🟢 𝐒ᴛᴀᴛᴜs: 𝐎ɴʟɪɴᴇ\n📱 𝐒ᴇssɪᴏɴs: ${sessions}\n⏱️ 𝐔ᴘᴛɪᴍᴇ: ${days} 𝐃ʏ ${hours} 𝐇ʀ ${mins} 𝐌ɪɴ\n⚡ 𝐏ɪɴɢ: 𝐑ᴇᴀʟ-𝐓ɪᴍᴇ\n\n🌷 𝐗 Nᴏʙɪᴛᴀ Mᴏᴅᴢ`;
}
function pingText(ms) { return `👀 𝐏ɪɴɢ\n\n⚡ 𝐑ᴇsᴘᴏɴsᴇ: ${ms} 𝐦s\n\n🌷 𝐗 Nᴏʙɪᴛᴀ Mᴏᴅᴢ`; }

const CALLING_CODE_MAP = {
    1: { iso: "US", name: "United States/Canada" },
    7: { iso: "RU", name: "Russia/Kazakhstan" },
    20: { iso: "EG", name: "Egypt" },
    27: { iso: "ZA", name: "South Africa" },
    30: { iso: "GR", name: "Greece" },
    31: { iso: "NL", name: "Netherlands" },
    32: { iso: "BE", name: "Belgium" },
    33: { iso: "FR", name: "France" },
    34: { iso: "ES", name: "Spain" },
    36: { iso: "HU", name: "Hungary" },
    39: { iso: "IT", name: "Italy" },
    40: { iso: "RO", name: "Romania" },
    41: { iso: "CH", name: "Switzerland" },
    43: { iso: "AT", name: "Austria" },
    44: { iso: "GB", name: "United Kingdom" },
    45: { iso: "DK", name: "Denmark" },
    46: { iso: "SE", name: "Sweden" },
    47: { iso: "NO", name: "Norway" },
    48: { iso: "PL", name: "Poland" },
    49: { iso: "DE", name: "Germany" },
    51: { iso: "PE", name: "Peru" },
    52: { iso: "MX", name: "Mexico" },
    53: { iso: "CU", name: "Cuba" },
    54: { iso: "AR", name: "Argentina" },
    55: { iso: "BR", name: "Brazil" },
    56: { iso: "CL", name: "Chile" },
    57: { iso: "CO", name: "Colombia" },
    58: { iso: "VE", name: "Venezuela" },
    60: { iso: "MY", name: "Malaysia" },
    61: { iso: "AU", name: "Australia" },
    62: { iso: "ID", name: "Indonesia" },
    63: { iso: "PH", name: "Philippines" },
    64: { iso: "NZ", name: "New Zealand" },
    65: { iso: "SG", name: "Singapore" },
    66: { iso: "TH", name: "Thailand" },
    81: { iso: "JP", name: "Japan" },
    82: { iso: "KR", name: "South Korea" },
    84: { iso: "VN", name: "Vietnam" },
    86: { iso: "CN", name: "China" },
    90: { iso: "TR", name: "Turkey" },
    91: { iso: "IN", name: "India" },
    92: { iso: "PK", name: "Pakistan" },
    93: { iso: "AF", name: "Afghanistan" },
    94: { iso: "LK", name: "Sri Lanka" },
    95: { iso: "MM", name: "Myanmar" },
    98: { iso: "IR", name: "Iran" },
    211: { iso: "SS", name: "South Sudan" },
    212: { iso: "MA", name: "Morocco" },
    213: { iso: "DZ", name: "Algeria" },
    216: { iso: "TN", name: "Tunisia" },
    218: { iso: "LY", name: "Libya" },
    220: { iso: "GM", name: "Gambia" },
    221: { iso: "SN", name: "Senegal" },
    233: { iso: "GH", name: "Ghana" },
    234: { iso: "NG", name: "Nigeria" },
    254: { iso: "KE", name: "Kenya" },
    255: { iso: "TZ", name: "Tanzania" },
    256: { iso: "UG", name: "Uganda" },
    260: { iso: "ZM", name: "Zambia" },
    263: { iso: "ZW", name: "Zimbabwe" },
    351: { iso: "PT", name: "Portugal" },
    353: { iso: "IE", name: "Ireland" },
    358: { iso: "FI", name: "Finland" },
    380: { iso: "UA", name: "Ukraine" },
    420: { iso: "CZ", name: "Czech Republic" },
    421: { iso: "SK", name: "Slovakia" },
    500: { iso: "FK", name: "Falkland Islands" },
    501: { iso: "BZ", name: "Belize" },
    502: { iso: "GT", name: "Guatemala" },
    505: { iso: "NI", name: "Nicaragua" },
    506: { iso: "CR", name: "Costa Rica" },
    507: { iso: "PA", name: "Panama" },
    591: { iso: "BO", name: "Bolivia" },
    593: { iso: "EC", name: "Ecuador" },
    595: { iso: "PY", name: "Paraguay" },
    598: { iso: "UY", name: "Uruguay" },
    670: { iso: "TL", name: "East Timor" },
    673: { iso: "BN", name: "Brunei" },
    675: { iso: "PG", name: "Papua New Guinea" },
    679: { iso: "FJ", name: "Fiji" },
    850: { iso: "KP", name: "North Korea" },
    852: { iso: "HK", name: "Hong Kong" },
    853: { iso: "MO", name: "Macau" },
    855: { iso: "KH", name: "Cambodia" },
    856: { iso: "LA", name: "Laos" },
    880: { iso: "BD", name: "Bangladesh" },
    886: { iso: "TW", name: "Taiwan" },
    960: { iso: "MV", name: "Maldives" },
    961: { iso: "LB", name: "Lebanon" },
    962: { iso: "JO", name: "Jordan" },
    963: { iso: "SY", name: "Syria" },
    964: { iso: "IQ", name: "Iraq" },
    965: { iso: "KW", name: "Kuwait" },
    966: { iso: "SA", name: "Saudi Arabia" },
    967: { iso: "YE", name: "Yemen" },
    968: { iso: "OM", name: "Oman" },
    971: { iso: "AE", name: "UAE" },
    972: { iso: "IL", name: "Israel" },
    973: { iso: "BH", name: "Bahrain" },
    974: { iso: "QA", name: "Qatar" },
    975: { iso: "BT", name: "Bhutan" },
    977: { iso: "NP", name: "Nepal" },
    992: { iso: "TJ", name: "Tajikistan" },
    993: { iso: "TM", name: "Turkmenistan" },
    994: { iso: "AZ", name: "Azerbaijan" },
    995: { iso: "GE", name: "Georgia" },
    996: { iso: "KG", name: "Kyrgyzstan" },
    998: { iso: "UZ", name: "Uzbekistan" },
    1242: { iso: "BS", name: "Bahamas" },
    1246: { iso: "BB", name: "Barbados" },
    1345: { iso: "KY", name: "Cayman Islands" },
    1868: { iso: "TT", name: "Trinidad and Tobago" },
    1876: { iso: "JM", name: "Jamaica" },
};

const SORTED_CODES = Object.keys(CALLING_CODE_MAP)
    .map(Number)
    .sort((a, b) => String(b).length - String(a).length || b - a);

function detectCountry(digits) {
    if (!digits) return null;
    if (digits.startsWith("00")) digits = digits.slice(2);
    for (const code of SORTED_CODES) {
      if (digits.startsWith(String(code))) {
        const info = CALLING_CODE_MAP[code];
        return { callingCode: code, iso: info.iso, name: info.name };
      }
    }
    return null;
}

function startTelegramPairing() {
  const token = TELEGRAM_BOT_TOKEN;
  if (!token || token === "PASTE_TELEGRAM_BOT_TOKEN_HERE" || /^YOUR_|^$/.test(token)) {
    console.log("ℹ️ Telegram pairing disabled: TELEGRAM_BOT_TOKEN is not set.");
    return null;
  }

  const bot = new TelegramBot(token, { polling: true });

  // Centralized protection for ALL Telegram messages sent by this bot module.
  // It never moderates incoming user messages.
  const selfOutputGuard = createSelfOutputGuard(bot);

  // Clean up a previous/incomplete pairing socket and stale auth data.
  // This must be defined before /pair uses it.
  async function cleanupPairingSession(sessionId, authDir, removeAuth = true) {
    const oldSock = pairingSessions.get(sessionId);
    try { oldSock?.ws?.terminate?.(); } catch {}
    try { oldSock?.end?.(); } catch {}
    pairingSessions.delete(sessionId);
    if (removeAuth) {
      await fs.promises.rm(authDir, { recursive: true, force: true }).catch(() => {});
    }
  }
  const WA_CHANNEL_LINK =
    process.env.WA_CHANNEL_LINK ||
    "https://whatsapp.com/channel/0029Vb6gE1WHrDZX1MbuPi3G";
  const GROUP_INVITE_LINK =
    process.env.TG_GROUP_LINK || "";

  function esc(s = "") {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  async function safeReply(chatId, text, opts = {}) {
    try {
      const sent = await bot.sendMessage(chatId, text, {
        parse_mode: "HTML",
        ...opts
      });
      return await selfOutputGuard.checkAndDelete(sent, text);
    } catch (e) {
      console.error("Telegram sendMessage failed:", e?.message || e);
      return null;
    }
  }

  async function safeEdit(chatId, messageId, text, opts = {}) {
    try {
      const edited = await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        ...opts
      });
      // Telegram's edit API returns an updated message for normal text edits.
      // If it does not, the guard still prevents unapproved URLs in future sends.
      if (edited?.message_id) {
        return await selfOutputGuard.checkAndDelete(edited, text);
      }
      return edited;
    } catch {
      return null;
    }
  }

  function isGroup(msg) {
    return msg?.chat?.type === "group" || msg?.chat?.type === "supergroup";
  }

  async function isGroupAdmin(msg) {
    if (!isGroup(msg)) return false;
    const userId = msg.from?.id;
    if (!userId) return false;
    try {
      const member = await bot.getChatMember(msg.chat.id, userId);
      return member?.status === "creator" || member?.status === "administrator";
    } catch (error) {
      console.error("Telegram admin check failed:", error?.message || error);
      return false;
    }
  }

  async function requireGroupAdmin(msg) {
    if (String(msg.chat?.id || "") !== OFFICIAL_PAIR_GROUP_ID) return false;
    if (await isGroupAdmin(msg)) return true;
    await safeReply(
      msg.chat.id,
      `🔒 <b>𝐀ᴅᴍɪɴ 𝐎ɴʟʏ</b>\n\n` +
      `❌ 𝐎ɴʟʏ 𝐆ʀᴏᴜᴘ 𝐀ᴅᴍɪɴs 𝐂ᴀɴ 𝐔sᴇ 𝐓ʜɪs 𝐂ᴏᴍᴍᴀɴᴅ.`,
      { reply_to_message_id: msg.message_id }
    );
    return false;
  }

  function redirectToGroup(chatId, replyToId) {
    const buttons = GROUP_INVITE_LINK
      ? { inline_keyboard: [[{ text: "🌷 Join Telegram Group", url: GROUP_INVITE_LINK }]] }
      : undefined;

    return safeReply(
      chatId,
      `🌸 <b>Group Only Feature</b>\n\n` +
      `➜ ${BRAND} pairing works inside a Telegram group.\n` +
      `➜ Add the bot to your group and use:\n` +
      `<code>/pair +917074420859</code>`,
      {
        reply_to_message_id: replyToId,
        reply_markup: buttons
      }
    );
  }

  // SECURITY: pairing/status/ping controls are accepted ONLY inside OFFICIAL_PAIR_GROUP_ID.

  bot.onText(/^\/start$/i, async (msg) => {
    if (String(msg.chat?.id || "") !== OFFICIAL_PAIR_GROUP_ID) return;
    return safeReply(msg.chat.id, startText, { reply_to_message_id: msg.message_id });
  });

  bot.onText(/^\/status$/i, async (msg) => {
    if (!(await requireGroupAdmin(msg))) return;
    const manager = global.__nobitaSessionManager;
    return safeReply(msg.chat.id, statusText(manager), { reply_to_message_id: msg.message_id });
  });

  bot.onText(/^\/ping$/i, async (msg) => {
    if (!(await requireGroupAdmin(msg))) return;
    const started = Date.now();
    const sent = await safeReply(msg.chat.id, "👀 𝐏ɪɴɢ\n\n⏳ 𝐂ʜᴇᴄᴋɪɴɢ...", { reply_to_message_id: msg.message_id });
    if (!sent?.message_id) return;
    const ms = Math.max(1, Date.now() - started);
    return safeEdit(msg.chat.id, sent.message_id, pingText(ms));
  });

  bot.onText(/^\/pair(?:\s+(.+))?$/i, async (msg, match) => {
    // Pairing codes are only generated inside the official X NOBITA XD group.
    // Any other group/private chat gets redirected to the official group instead.
    if (String(msg.chat?.id || "") !== OFFICIAL_PAIR_GROUP_ID) {
      return safeReply(
        msg.chat.id,
        `🌷 <b>X NOBITA XD Pairing</b>\n\n` +
        `🔐 Pairing code পেতে আমাদের official group-এ আসুন।\n\n` +
        `💗 <a href="${OFFICIAL_PAIR_GROUP_LINK}">Join Official Pairing Group</a>`,
        { reply_to_message_id: msg.message_id, disable_web_page_preview: false }
      );
    }

    const userId = String(msg.from?.id || msg.chat.id);
    const remaining = PAIR_COOLDOWN_MS - (Date.now() - (pairCooldown.get(userId) || 0));
    if (remaining > 0) {
      return safeReply(
        msg.chat.id,
        `⏳ <b>𝐏ʟᴇᴀsᴇ 𝐖ᴀɪᴛ ${Math.ceil(remaining / 1000)}s</b>

💗 𝐏ᴀɪʀɪɴɢ 𝐑ᴇǫᴜᴇsᴛ 𝐈s 𝐂ᴏᴏʟᴅɪɴɢ 𝐃ᴏᴡɴ.`,
        { reply_to_message_id: msg.message_id }
      );
    }

    const rawArg = String(match?.[1] || "").trim();
    const phone = normalizePhone(rawArg);

    if (!phone || !/^\d{8,15}$/.test(phone)) {
      return safeReply(
        msg.chat.id,
        `❌ <b>𝐈ɴᴠᴀʟɪᴅ 𝐍ᴜᴍʙᴇʀ</b>\n\n` +
        `📱 𝐔sᴇ: <code>/pair 919876543210</code>\n` +
        `🌍 𝐔sᴇ 𝐅ᴜʟʟ 𝐂ᴏᴜɴᴛʀʏ 𝐂ᴏᴅᴇ`,
        { reply_to_message_id: msg.message_id }
      );
    }

    // Do not reject a number just because our local country-code display map
    // does not contain its calling code. WhatsApp/Baileys is the authority for
    // whether the E.164 number can actually receive a pairing code.
    const countryInfo = detectCountry(phone) || {
      callingCode: "",
      iso: "",
      name: "International"
    };

    pairCooldown.set(userId, Date.now());

    const sessionId = safeSessionId(phone);
    const authDir = path.join(process.cwd(), "sessions", sessionId);
    const manager = global.__nobitaSessionManager;

    if (manager?.isRunning(sessionId)) {
      return safeReply(
        msg.chat.id,
        `💚 <b>𝐀ʟʀᴇᴀᴅʏ 𝐂ᴏɴɴᴇᴄᴛᴇᴅ</b>\n\n📱 <code>+${esc(phone)}</code>\n❤️‍🩹 𝐖ʜᴀᴛsAᴘᴘ: 𝐎ɴʟɪɴᴇ`,
        { reply_to_message_id: msg.message_id }
      );
    }

    if (pairingSessions.has(sessionId)) {
      return safeReply(
        msg.chat.id,
        `⏳ <b>𝐏ᴀɪʀɪɴɢ 𝐑ᴜɴɴɪɴɢ</b>\n\n📱 <code>+${esc(phone)}</code>\n💗 𝐏ʟᴇᴀsᴇ 𝐖ᴀɪᴛ...`,
        { reply_to_message_id: msg.message_id }
      );
    }

    await cleanupPairingSession(sessionId, authDir, true);

    if (!manager || typeof manager.start !== "function") {
      return safeReply(
        msg.chat.id,
        failedText(phone),
        { reply_to_message_id: msg.message_id }
      );
    }

    let loadingMsg = null;

    try {
      loadingMsg = await safeReply(
        msg.chat.id,
        `⏳ <b>𝐆ᴇɴᴇʀᴀᴛɪɴɢ 𝐂ᴏᴅᴇ</b>\n\n` +
        `📱 <code>+${esc(phone)}</code>\n` +
        `🔄 <i>𝐏ʟᴇᴀsᴇ 𝐖ᴀɪᴛ...</i>`,
        { reply_to_message_id: msg.message_id }
      );

      let resolveCode, rejectCode;
      const codePromise = new Promise((resolve, reject) => {
        resolveCode = resolve;
        rejectCode = reject;
      });

      let opened = false;

      const sock = await manager.start(sessionId, {
        skipPairing: false,
        pairedPhone: phone,
        isPairingFlow: true,
        onPairingCode: resolveCode,
        onPairingError: rejectCode,
        onOpen: async () => {
          opened = true;
          pairingFinalized.add(sessionId);
          pairingSessions.delete(sessionId);
          try { manager.register(sessionId); } catch {}

          // If the code message is already present, the watcher below will edit it.
          // Otherwise send a connected confirmation.
        },
        onClose: async (code, detail) => {
          // Always clear the in-memory pairing lock when the pairing socket closes.
          // This prevents a stale "pairing request is already running" message after
          // the linked account logs out or the pairing socket disconnects.
          pairingSessions.delete(sessionId);

          if (!opened && code !== 515 && !pairingFinalized.has(sessionId)) {
            pairingFinalized.add(sessionId);
            await cleanupPairingSession(sessionId, authDir, true);
            const reason = detail?.error?.message || detail?.message || `status ${code || "unknown"}`;
            rejectCode(new Error(reason));
          }
        }
      });

      if (!sock || typeof sock.requestPairingCode !== "function") {
        throw new Error("WhatsApp socket was not created");
      }

      pairingSessions.set(sessionId, sock);

      if (loadingMsg?.message_id) {
        try { await bot.deleteMessage(msg.chat.id, loadingMsg.message_id); } catch {}
      }

      const code = await Promise.race([
        codePromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Pairing code generation timed out")), 30_000)
        )
      ]);

      const formatted = formatPairingCode(code);
      const flag = isoToFlag(countryInfo.iso);

      const pairText =
        `💗 <b>𝐏ᴀɪʀɪɴɢ 𝐂ᴏᴅᴇ 𝐑ᴇᴀᴅʏ</b>\n\n` +
        `📱 𝐍ᴜᴍʙᴇʀ: <code>+${esc(phone)}</code>\n` +
        `🌍 𝐂ᴏᴜɴᴛʀʏ: ${flag} <b>${esc(countryInfo.name)}</b>${countryInfo.callingCode ? ` (+${countryInfo.callingCode})` : ""}\n\n` +
        `🔐 𝐂ᴏᴅᴇ: <code>${esc(formatted)}</code>\n\n` +
        `⏳ 𝐄xᴘɪʀᴇs 𝐈ɴ: 𝟿𝟶 𝐒ᴇᴄᴏɴᴅs\n` +
        `⚠️ 𝐃ᴏ 𝐍ᴏᴛ 𝐒ʜᴀʀᴇ 𝐓ʜᴇ 𝐂ᴏᴅᴇ\n\n` +
        `🌷 𝐗 Nᴏʙɪᴛᴀ Mᴏᴅᴢ`;

      const pairMsg = await safeReply(
        msg.chat.id,
        pairText,
        {
          reply_to_message_id: msg.message_id,
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [{ text: "📋 𝐂ᴏᴘʏ 𝐏ᴀɪʀɪɴɢ 𝐂ᴏᴅᴇ", copy_text: { text: formatted } }],
              []
            ]
          }
        }
      );

      // Miku-style background watcher: edit the same pair message after connection.
      if (pairMsg?.message_id) {
        const msgId = pairMsg.message_id;
        const WATCH_TIMEOUT_MS = 5 * 60 * 1000;

        (async () => {
          try {
            await new Promise((resolve, reject) => {
              const timer = setTimeout(() => {
                manager.removeListener("connected", onConn);
                manager.removeListener("session.deleted", onDel);
                reject(new Error("timeout"));
              }, WATCH_TIMEOUT_MS);

              function onConn(sid) {
                if (sid !== sessionId) return;
                clearTimeout(timer);
                manager.removeListener("connected", onConn);
                manager.removeListener("session.deleted", onDel);
                resolve();
              }

              function onDel(sid) {
                if (sid !== sessionId) return;
                clearTimeout(timer);
                manager.removeListener("connected", onConn);
                manager.removeListener("session.deleted", onDel);
                reject(new Error("deleted"));
              }

              manager.on("connected", onConn);
              manager.on("session.deleted", onDel);

              if (manager.isRunning(sessionId)) {
                onConn(sessionId);
              }
            });

            await safeEdit(
              msg.chat.id,
              msgId,
              `❤️‍🩹 <b>𝐂ᴏɴɴᴇᴄᴛᴇᴅ 𝐒ᴜᴄᴄᴇssғᴜʟʟʏ</b>\n\n` +
              `📱 𝐍ᴜᴍʙᴇʀ: <code>+${esc(phone)}</code>\n` +
              `💚 𝐖ʜᴀᴛsAᴘᴘ: 𝐎ɴʟɪɴᴇ\n\n` +
              `✨ 𝐘ᴏᴜʀ 𝐁ᴏᴛ 𝐈s 𝐑ᴇᴀᴅʏ`,
              { reply_markup: { inline_keyboard: [[]] } }
            );
          } catch {
            await safeEdit(
              msg.chat.id,
              msgId,
              `🥀 <b>𝐏ᴀɪʀɪɴɢ 𝐂ᴏᴅᴇ 𝐄xᴘɪʀᴇᴅ</b>\n\n` +
              `📱 𝐍ᴜᴍʙᴇʀ: <code>+${esc(phone)}</code>\n` +
              `⏳ 𝐓ʜᴇ 𝐂ᴏᴅᴇ 𝐈s 𝐍ᴏ 𝐋ᴏɴɢᴇʀ 𝐕ᴀʟɪᴅ\n\n` +
              `🔄 𝐓ʀʏ 𝐀ɢᴀɪɴ\n` +
              `<code>/pair ${esc(phone)}</code>`,
              { reply_markup: { inline_keyboard: [[]] } }
            );
          }
        })();
      }

      // Give the session manager time to emit connection events.
      return pairMsg;
    } catch (error) {
      if (loadingMsg?.message_id) {
        try { await bot.deleteMessage(msg.chat.id, loadingMsg.message_id); } catch {}
      }
      await cleanupPairingSession(sessionId, authDir, true);
      console.error("Telegram pairing error:", error?.message || error);

      if (!pairingFinalized.has(sessionId)) {
        pairingFinalized.add(sessionId);
        return safeReply(
          msg.chat.id,
          `💔 <b>𝐏ᴀɪʀɪɴɢ 𝐅ᴀɪʟᴇᴅ</b>\n\n` +
          `📱 𝐍ᴜᴍʙᴇʀ: <code>+${esc(phone)}</code>\n` +
          `🥀 𝐑ᴇᴀsᴏɴ: <i>${esc(error?.message || String(error))}</i>\n\n` +
          `🔄 𝐏ʟᴇᴀsᴇ 𝐓ʀʏ 𝐀ɢᴀɪɴ\n` +
          `➜ /pair ${esc(phone)}`,
          { reply_to_message_id: msg.message_id }
        );
      }
    }
  });

  bot.on("polling_error", (error) =>
    console.error("Telegram polling error:", error?.message || error)
  );
  bot.on("error", (error) =>
    console.error("Telegram bot error:", error?.message || error)
  );

  console.log("✅ Telegram Miku-style pairing control for X NOBITA MODZ is running.");
  return bot;
}

module.exports = { startTelegramPairing };
