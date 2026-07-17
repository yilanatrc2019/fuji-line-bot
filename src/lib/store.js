import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * 待辦留言的資料存放。
 *
 * 用一個 JSON 檔存，沒有用資料庫 —— 一個輔具中心的留言量一天大概幾十筆，
 * JSON 檔綽綽有餘，而且同仁可以直接打開看、直接備份。
 *
 * ⚠️ 注意：如果部署在 Render / Cloud Run 的免費方案，重新部署時檔案會被清空。
 *    詳見 README「資料保存」那段。
 */

const DB_PATH = fileURLToPath(new URL('../../data/tickets.json', import.meta.url));

function ensureFile() {
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(DB_PATH)) writeFileSync(DB_PATH, JSON.stringify({ tickets: [] }, null, 2));
}

function read() {
  ensureFile();
  try {
    return JSON.parse(readFileSync(DB_PATH, 'utf8'));
  } catch (err) {
    console.error('[store] tickets.json 讀取失敗，改用空清單繼續跑：', err.message);
    return { tickets: [] };
  }
}

/**
 * 先寫暫存檔再改名。直接覆寫的話，萬一寫到一半當掉，檔案會壞掉而且救不回來。
 */
function write(db) {
  ensureFile();
  const tmp = `${DB_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(db, null, 2));
  renameSync(tmp, DB_PATH);
}

/**
 * 記一筆待辦。
 * 同一個人如果已經有還沒處理的留言，就把新訊息接在後面，不另開一筆 ——
 * 否則民眾連打三句話，同仁的清單上就會出現三筆看起來像三個人。
 */
export function addTicket({ userId, displayName, text, topic }) {
  const db = read();
  const open = db.tickets.find((t) => t.userId === userId && t.status === 'open');

  if (open) {
    open.messages.push({ text, at: new Date().toISOString() });
    open.topic = topic || open.topic;
    write(db);
    return open;
  }

  const ticket = {
    id: randomUUID().slice(0, 8),
    userId,
    displayName: displayName || '（未提供名稱）',
    topic: topic || null,
    messages: [{ text, at: new Date().toISOString() }],
    status: 'open',
    createdAt: new Date().toISOString(),
    doneAt: null,
  };
  db.tickets.push(ticket);
  write(db);
  return ticket;
}

export function listOpen() {
  return read().tickets.filter((t) => t.status === 'open');
}

export function listAll() {
  return read().tickets;
}

export function markDone(id) {
  const db = read();
  const ticket = db.tickets.find((t) => t.id === id);
  if (!ticket || ticket.status === 'done') return null;

  ticket.status = 'done';
  ticket.doneAt = new Date().toISOString();
  write(db);
  return ticket;
}

/**
 * 存放「今天的提醒推過了沒」之類的雜項。
 * 存進檔案而不是放在記憶體，是因為機器人如果剛好在提醒時間前後重開，
 * 記憶體的紀錄會消失，同仁就會收到第二份一模一樣的待辦清單。
 */
export function getMeta(key) {
  return read().meta?.[key] ?? null;
}

export function setMeta(key, value) {
  const db = read();
  db.meta = { ...(db.meta || {}), [key]: value };
  write(db);
}
