import { REMINDER, PUBLIC_BASE_URL, ADMIN_TOKEN } from '../config.js';
import { taipeiNow } from './hours.js';
import { listOpen, getMeta, setMeta } from './store.js';
import { staffReminder } from './messages.js';

/**
 * 每天早上推一則待辦清單給同仁。
 *
 * 只推給同仁，不推給民眾 —— 民眾在留言的當下就已經收到「我們何時回覆您」了，
 * 那是回覆不是推播，不花額度。詳見 config.js 的說明。
 *
 * 沒有用 cron 套件，是因為需求很單純：每分鐘看一下台北時間到了沒。
 * 少一個相依套件，中心以後要維護也少一件要懂的事。
 */

const CHECK_INTERVAL_MS = 60 * 1000;

export function adminUrl() {
  return `${PUBLIC_BASE_URL}/admin?token=${encodeURIComponent(ADMIN_TOKEN)}`;
}

export async function runReminder(client, { force = false } = {}) {
  const { date } = taipeiNow();

  if (!force && getMeta('lastReminderDate') === date) return { skipped: true };
  if (!REMINDER.staffGroupId) {
    console.warn('[reminder] 沒設定 STAFF_GROUP_ID，跳過推播。');
    return { skipped: true, reason: 'no-group' };
  }

  const tickets = listOpen();

  // 先記已經跑過，再開始推播。
  // 反過來的話，推到一半掛掉重開，同仁會收到第二份一模一樣的清單。
  setMeta('lastReminderDate', date);

  // 沒有待辦就不發，省額度也不吵人。
  if (!tickets.length) {
    console.log(`[reminder] ${date} 沒有待辦，不發提醒。`);
    return { sent: 0 };
  }

  try {
    await client.pushMessage({
      to: REMINDER.staffGroupId,
      messages: [staffReminder(tickets, adminUrl(), { pushed: true })],
    });
    console.log(`[reminder] ${date} 已推播待辦清單，共 ${tickets.length} 筆。`);
    return { sent: 1, tickets: tickets.length };
  } catch (err) {
    console.error('[reminder] 推播失敗：', err.message);
    return { sent: 0, error: err.message };
  }
}

export function startScheduler(client) {
  if (!REMINDER.time) {
    console.log('[reminder] REMINDER.time 是 null，不做每日推播（同仁仍可在群組打「待辦」查詢）。');
    return;
  }

  const [targetH, targetM] = REMINDER.time.split(':').map(Number);
  const targetMinutes = targetH * 60 + targetM;

  setInterval(() => {
    const { minutes, date } = taipeiNow();

    if (minutes < targetMinutes) return;
    if (getMeta('lastReminderDate') === date) return;

    // 用 >= 而不是 ==，這樣機器人如果在 09:00 剛好在重開或睡著，
    // 醒來後還是會補送，不會整天漏掉。
    runReminder(client).catch((err) => console.error('[reminder] 執行失敗：', err));
  }, CHECK_INTERVAL_MS);

  console.log(`[reminder] 排程已啟動，每天 ${REMINDER.time}（台北時間）推待辦給同仁。`);
}
