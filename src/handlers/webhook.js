import { CENTER, REMINDER, STAFF_QUERY_KEYWORDS } from '../config.js';
import { match, getEntry } from '../lib/matcher.js';
import { isOpen } from '../lib/hours.js';
import { buildMessages, afterHoursNotice, fallback, staffReminder } from '../lib/messages.js';
import { addTicket, listOpen } from '../lib/store.js';
import { adminUrl } from '../lib/reminder.js';

/** LINE 一次最多回 5 則訊息，超過會整包被拒絕。 */
const MAX_MESSAGES = 5;

export function createHandler(client) {
  return async function handleEvent(event) {
    try {
      if (event.source?.type === 'group' || event.source?.type === 'room') {
        return await onGroup(client, event);
      }

      if (event.type === 'follow') return await onFollow(client, event);
      if (event.type === 'postback') return await onPostback(client, event);
      if (event.type === 'message' && event.message.type === 'text') {
        return await onText(client, event);
      }
      // 貼圖、照片、語音等等一律不處理，讓同仁自己在後台看。
    } catch (err) {
      console.error('[webhook] 處理事件失敗：', err);
      // 這裡故意不往外丟。回 200 給 LINE，否則 LINE 會一直重送同一個事件。
    }
  };
}

/**
 * 群組訊息。
 *
 * ⚠️ 這裡是「民眾的留言和姓名」會不會外洩的關卡，改的時候要特別小心。
 *
 * 只有中心自己的同仁群組（STAFF_GROUP_ID）打「待辦」才會拿到清單。
 * 不鎖群組的話，任何人只要把中心的官方帳號拉進自己的群組、打「待辦」兩個字，
 * 就能看到所有民眾的留言內容和名字。
 *
 * 這是「回覆」不是「推播」，所以查幾次都不花額度。
 */
async function onGroup(client, event) {
  const groupId = event.source.groupId || event.source.roomId;

  // 設定 STAFF_GROUP_ID 時要用：同仁在群組講一句話，ID 就會出現在 log。
  if (!REMINDER.staffGroupId) {
    console.log(`[webhook] 收到群組訊息，groupId = ${groupId}（尚未設定 STAFF_GROUP_ID）`);
    return;
  }

  if (groupId !== REMINDER.staffGroupId) {
    console.warn(`[webhook] 非同仁群組的訊息，已忽略。groupId = ${groupId}`);
    return; // 不是同仁群組，一律裝作沒看到
  }

  if (event.type !== 'message' || event.message.type !== 'text') return;

  const asked = STAFF_QUERY_KEYWORDS.some((k) => event.message.text.includes(k));
  if (!asked) return; // 同仁在群組聊天，不要亂插話

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [staffReminder(listOpen(), adminUrl())],
  });
}

async function onFollow(client, event) {
  await client.replyMessage({
    replyToken: event.replyToken,
    messages: [
      {
        type: 'text',
        text:
          `歡迎加入${CENTER.name} 👋\n\n` +
          `我是中心的小幫手，可以直接問我：\n` +
          `・補助怎麼申請\n` +
          `・輔具借用\n` +
          `・評估預約\n` +
          `・中心地址電話\n\n` +
          `也可以點下面的選單找答案。\n` +
          `非服務時間留言也沒關係，專人會在服務時間回覆您 🙂`,
        quickReply: {
          items: ['apply-flow', 'borrow', 'assessment', 'center-info']
            .map((id) => getEntry(id))
            .filter(Boolean)
            .map((entry) => ({
              type: 'action',
              action: {
                type: 'postback',
                label: entry.title,
                data: `faq=${entry.id}`,
                displayText: entry.title,
              },
            })),
        },
      },
    ],
  });
}

/** 點選單或點建議按鈕。這種是「自己找到答案」，不算需要專人處理的留言。 */
async function onPostback(client, event) {
  const params = new URLSearchParams(event.postback.data);
  const entry = getEntry(params.get('faq'));

  if (!entry) {
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: fallback(isOpen()),
    });
  }

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: buildMessages(entry).slice(0, MAX_MESSAGES),
  });
}

async function onText(client, event) {
  const text = event.message.text;
  const open = isOpen();
  const result = match(text);

  const messages = result ? buildMessages(result.entry) : fallback(open);

  // 非服務時間：先講一句「現在沒人在」，再給答案。
  if (!open) {
    const needsHuman = result ? Boolean(result.entry.needsHuman) : true;
    if (result) messages.unshift(afterHoursNotice(needsHuman));

    // 沒聽懂、或問的是需要專人處理的題目，才記成待辦。
    // 民眾只是點選單查到「地址在哪」，不需要占用同仁的待辦清單。
    if (needsHuman) {
      await recordTicket(client, event, text, result?.entry.id);
    }
  }

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: messages.slice(0, MAX_MESSAGES),
  });
}

async function recordTicket(client, event, text, topic) {
  const userId = event.source.userId;
  if (!userId) return; // 群組裡沒有 userId 的情況

  let displayName = null;
  try {
    const profile = await client.getProfile(userId);
    displayName = profile.displayName;
  } catch {
    // 民眾關閉個人資料授權時會失敗，記不到名字不影響待辦本身。
  }

  addTicket({ userId, displayName, text, topic });
}
