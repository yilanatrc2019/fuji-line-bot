import { BUSINESS_HOURS } from '../config.js';

/**
 * 判斷「現在有沒有人在」。
 *
 * 伺服器很可能跑在 UTC（Render / Cloud Run 預設都是），
 * 所以絕不能用 new Date().getHours()，一定要換算到 Asia/Taipei。
 */

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_HOURS.timeZone,
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** 把當下時間換算成台北時區的 { weekday, date, minutes }。 */
export function taipeiNow(now = new Date()) {
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((p) => [p.type, p.value])
  );

  // Intl 在午夜會回 "24"，正規化成 0，否則 24:10 會被算成 1450 分而落在所有時段之外。
  const hour = parts.hour === '24' ? 0 : Number(parts.hour);

  return {
    weekday: WEEKDAY_INDEX[parts.weekday],
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: hour * 60 + Number(parts.minute),
  };
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * @returns {boolean} true = 服務時間內（有人在）
 */
export function isOpen(now = new Date()) {
  const { weekday, date, minutes } = taipeiNow(now);

  if (BUSINESS_HOURS.holidays.includes(date)) return false;

  const slots = BUSINESS_HOURS.days[weekday];
  if (!slots) return false;

  return slots.some(([start, end]) => {
    const s = toMinutes(start);
    const e = toMinutes(end);
    // 起點含、終點不含：17:00 收班時 17:00 整已經算下班。
    return minutes >= s && minutes < e;
  });
}

/**
 * 找出下一個開始服務的時間，用來告訴民眾「我們什麼時候回覆你」。
 * @returns {{ date: string, weekday: number, start: string } | null}
 */
export function nextOpening(now = new Date()) {
  const { weekday, date, minutes } = taipeiNow(now);

  for (let offset = 0; offset < 14; offset++) {
    const day = (weekday + offset) % 7;
    const target = addDays(date, offset);

    if (BUSINESS_HOURS.holidays.includes(target)) continue;

    const slots = BUSINESS_HOURS.days[day];
    if (!slots) continue;

    for (const [start] of slots) {
      // 今天的話只看還沒到的時段
      if (offset === 0 && toMinutes(start) <= minutes) continue;
      return { date: target, weekday: day, start };
    }
  }
  return null;
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];

/** 產生「我們會在 X 回覆您」的人話描述。 */
export function nextOpeningText(now = new Date()) {
  const next = nextOpening(now);
  if (!next) return null;

  const today = taipeiNow(now).date;
  const when = next.date === today ? '今天' : `${next.date.slice(5).replace('-', '/')}（週${WEEKDAY_ZH[next.weekday]}）`;
  return `${when} ${next.start}`;
}
