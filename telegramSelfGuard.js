const fs = require("fs");
const path = require("path");

/*
 * Telegram self-output guard.
 *
 * Scope:
 * - Only messages sent/edited by THIS bot through this Telegram module are checked.
 * - User messages are never moderated by this guard.
 * - URLs that already exist in the project source are treated as approved.
 * - Runtime-generated non-URL values (pairing codes, usernames, uptime, etc.) are allowed.
 *
 * If a message contains a URL/Telegram handle that is not approved, the bot
 * deletes its own message after sending it (where Telegram permits deletion).
 */

const PROJECT_ROOT = __dirname;

function collectProjectUrls() {
  const approved = new Set();

  const files = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "session" || entry.name === "sessions") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|json|md|txt|env)$/i.test(entry.name)) files.push(full);
    }
  };

  walk(PROJECT_ROOT);

  for (const file of files) {
    let text = "";
    try { text = fs.readFileSync(file, "utf8"); } catch { continue; }

    const urls = text.match(/https?:\/\/[^\s"'`<>()[\]{}]+/gi) || [];
    for (let url of urls) {
      url = url.replace(/[\\n\\r]+$/g, "").replace(/[.,;:!?]+$/g, "");
      try {
        const u = new URL(url);
        approved.add(`${u.protocol}//${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`);
      } catch {}
    }
  }

  // These are official X NOBITA links intentionally used by this Telegram module.
  for (const url of [
    "https://t.me/x_nobita_xd_pair",
    "https://whatsapp.com/channel/0029Vb6gE1WHrDZX1MbuPi3G"
  ]) {
    try {
      const u = new URL(url);
      approved.add(`${u.protocol}//${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`);
    } catch {}
  }

  return approved;
}

function normalizeUrl(raw) {
  let value = String(raw || "").trim().replace(/[.,;:!?]+$/g, "");
  try {
    const u = new URL(value);
    return `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return null;
  }
}

function extractUrls(text) {
  const urls = String(text || "").match(/https?:\/\/[^\s"'`<>()[\]{}]+/gi) || [];
  const telegramHandles = String(text || "").match(/(?:^|\s)@[A-Za-z0-9_]{5,32}\b/g) || [];
  return {
    urls: urls.map(normalizeUrl).filter(Boolean),
    handles: telegramHandles.map(x => x.trim().toLowerCase())
  };
}

function hasUnauthorizedLink(text, approvedUrls) {
  const { urls, handles } = extractUrls(text);

  for (const url of urls) {
    if (!approvedUrls.has(url)) return true;
  }

  // A Telegram @handle is also treated as an external destination unless it
  // is one of the project's known official handles.
  const allowedHandles = new Set([
    "@x_nobita_xd_pair",
    "@nobitarose"
  ]);

  for (const handle of handles) {
    if (!allowedHandles.has(handle)) return true;
  }

  return false;
}

function messageText(message) {
  return (
    message?.text ||
    message?.caption ||
    message?.reply_markup?.inline_keyboard?.flat?.().map?.(b => b?.url || "").join(" ") ||
    ""
  );
}

function createSelfOutputGuard(bot, options = {}) {
  const approvedUrls = collectProjectUrls();
  const logger = options.logger || console;

  async function checkAndDelete(sentMessage, fallbackText = "") {
    if (!sentMessage?.message_id || !sentMessage?.chat?.id) return sentMessage;

    const text = `${messageText(sentMessage)}\n${fallbackText}`;
    if (!hasUnauthorizedLink(text, approvedUrls)) return sentMessage;

    try {
      await bot.deleteMessage(sentMessage.chat.id, sentMessage.message_id);
      logger.warn?.(
        `🛡️ Telegram self-output guard deleted unauthorized bot output ` +
        `(chat=${sentMessage.chat.id}, message=${sentMessage.message_id})`
      );
    } catch (error) {
      logger.warn?.(
        `⚠️ Self-output guard detected unauthorized output but could not delete it: ${error?.message || error}`
      );
    }

    return null;
  }

  return {
    checkAndDelete,
    refresh() {
      return collectProjectUrls();
    }
  };
}

module.exports = { createSelfOutputGuard };
