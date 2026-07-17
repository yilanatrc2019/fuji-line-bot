import { CENTER, BUSINESS_HOURS, PUBLIC_BASE_URL } from '../config.js';
import { getEntry } from './matcher.js';
import { nextOpeningText } from './hours.js';

/**
 * FAQ 文字裡的 {{變數}} 代換。
 * 中心的電話或地址如果變了，只要改 config.js，所有回覆都會跟著變。
 */
const VARS = {
  name: CENTER.name,
  address: CENTER.address,
  phone: CENTER.phone,
  lineId: CENTER.lineId,
  hours: BUSINESS_HOURS.humanReadable,
  maps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(CENTER.address)}`,
};

export function render(text) {
  return text.replace(/\{\{(\w+)\}\}/g, (whole, key) =>
    key in VARS ? VARS[key] : whole
  );
}

/** 建議按鈕（LINE 的 Quick Reply），最多 13 個，我們只用前 4 個。 */
function quickReply(ids = []) {
  const items = ids
    .map((id) => getEntry(id))
    .filter(Boolean)
    .slice(0, 4)
    .map((entry) => ({
      type: 'action',
      action: { type: 'postback', label: entry.title, data: `faq=${entry.id}`, displayText: entry.title },
    }));

  return items.length ? { items } : undefined;
}

/**
 * 把 FAQ 的一則轉成 LINE 看得懂的訊息陣列。
 * 建議按鈕只能掛在最後一則訊息上，掛在中間的會被 LINE 忽略。
 */
export function buildMessages(entry) {
  const messages = entry.messages.map((m) => {
    if (m.type === 'text') {
      return { type: 'text', text: render(m.text) };
    }
    if (m.type === 'image') {
      const url = `${PUBLIC_BASE_URL}/img/${m.file}`;
      return { type: 'image', originalContentUrl: url, previewImageUrl: url };
    }
    throw new Error(`faq.json 裡有不認得的訊息類型：${m.type}`);
  });

  const qr = quickReply(entry.suggest);
  if (qr) messages[messages.length - 1].quickReply = qr;

  return messages;
}

/** 非服務時間時，在答案前面補一句「現在沒人在，但我先回答你」。 */
export function afterHoursNotice(needsHuman) {
  const next = nextOpeningText();
  const when = next ? `${next}` : '下一個服務時段';

  if (needsHuman) {
    return {
      type: 'text',
      text:
        `您好，現在是非服務時間，我先提供資料給您參考 👇\n\n` +
        `您的留言我們已經收到，專人會在 ${when} 之後與您聯繫。\n` +
        `急件請於服務時間來電 ${CENTER.phone}。`,
    };
  }
  return {
    type: 'text',
    text: `您好，現在是非服務時間，以下資料由機器人自動提供 👇`,
  };
}

/** 完全聽不懂的時候的回覆。 */
export function fallback(isOpen) {
  const suggestions = ['apply-flow', 'borrow', 'assessment', 'contact-human'];

  const text = isOpen
    ? `不好意思，我看不太懂您的問題 😅\n\n您可以點下面的按鈕，或直接來電 ${CENTER.phone}。\n也可以在這裡留言，專人會盡快回覆您。`
    : `不好意思，我看不太懂您的問題 😅\n\n現在是非服務時間，您的留言我們已經收到，專人會在${
        nextOpeningText() ? ` ${nextOpeningText()} 之後` : '下一個服務時段'
      }與您聯繫。\n\n您也可以先點下面的按鈕自己查查看 👇`;

  return [{ type: 'text', text, quickReply: quickReply(suggestions) }];
}

/**
 * 給同仁看的待辦清單。
 *
 * 早上 9 點推播、和同仁在群組打「待辦」時，都是用這個。
 * 民眾永遠不會收到推播 —— 他們在留言當下就已經被告知何時回覆了。
 */
export function staffReminder(tickets, adminUrl, { pushed = false } = {}) {
  if (!tickets.length) {
    return { type: 'text', text: '✅ 目前沒有待回覆的留言。' };
  }

  const lines = tickets.map((t, i) => {
    const first = t.messages[0];
    const preview = first.text.length > 30 ? `${first.text.slice(0, 30)}…` : first.text;
    const time = new Date(first.at).toLocaleString('zh-TW', {
      timeZone: BUSINESS_HOURS.timeZone,
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const count = t.messages.length > 1 ? `（共 ${t.messages.length} 則）` : '';
    const waited = waitedText(first.at);
    return `${i + 1}. ${t.displayName}${count}${waited}\n   ${time}｜${preview}`;
  });

  const head = pushed
    ? `🔔 有 ${tickets.length} 位民眾留言還沒回覆：`
    : `📋 目前有 ${tickets.length} 位民眾留言還沒回覆：`;

  return {
    type: 'text',
    text: `${head}\n\n${lines.join('\n\n')}\n\n回覆完請到這裡點「已處理」銷單：\n${adminUrl}`,
  };
}

/** 等太久的要標出來，不然清單一長就會有人被沉在下面。 */
function waitedText(iso) {
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (days >= 2) return ` ⚠️ 已等 ${days} 天`;
  return '';
}
