import 'dotenv/config';

/**
 * 中心基本資料。
 * 來源：中心宣傳單（身障輔具補助申請流程）。
 */
export const CENTER = {
  name: '宜蘭縣溪北輔具資源中心',
  address: '宜蘭縣宜蘭市聖後街141號',
  phone: '03-9320920',
  lineId: '@188jxowa',
};

/**
 * 服務時間（24 小時制，時區固定 Asia/Taipei）。
 * 這個表決定「有人在」還是「轉自動回覆」。
 *
 * days: 0=週日, 1=週一 ... 6=週六。沒列到的日子視為休息。
 * 每天可設多個時段，中午休息與夜間服務都是靠切段表示。
 *
 * 週三夜間 17:30–19:30 為中心確認過的夜間服務時段。
 *
 * ⚠️ 上線前請中心再確認：平日上午起始時間、中午休息時段是否為下列設定。
 */
export const BUSINESS_HOURS = {
  timeZone: 'Asia/Taipei',
  days: {
    1: [['08:00', '12:00'], ['13:00', '17:00']],
    2: [['08:00', '12:00'], ['13:00', '17:00']],
    3: [['08:00', '12:00'], ['13:00', '17:00'], ['17:30', '19:30']], // 週三夜間服務
    4: [['08:00', '12:00'], ['13:00', '17:00']],
    5: [['08:00', '12:00'], ['13:00', '17:00']],
  },
  // 例外休息日（國定假日等），格式 YYYY-MM-DD。列在這裡的日子一律視為休息。
  holidays: [
    // '2026-01-01',
  ],
  // 顯示給民眾看的說明文字，請與上面設定保持一致
  humanReadable:
    '週一至週五 08:00–12:00、13:00–17:00\n週三另有夜間服務 17:30–19:30\n（例假日休息）',
};

/**
 * 待辦提醒設定。
 *
 * ⚠️ 額度規則：LINE 只對「主動推播」計費，機器人「回覆」是免費且無上限的。
 *    所以這支機器人的原則是：
 *      - 民眾：永遠不推播。他們在留言的當下就會收到「我們何時回覆您」（那是回覆，不花額度）
 *      - 同仁：每天早上推一則待辦清單，一天最多 1 則，沒有待辦時不發
 *              另外同仁在群組打「待辦」可以隨時查，那是回覆，不花額度
 *
 *    以每月 22 個工作日估，最多用掉 22 則，免費額度是 200 則/月。
 *    要完全不花額度的話，把 time 設成 null，只留群組打字查詢。
 */
export const REMINDER = {
  time: '09:00', // 每天幾點推待辦清單給同仁（台北時間）。設成 null 就完全不推。
  staffGroupId: env('STAFF_GROUP_ID'), // 空的就不推，機器人其他功能照常
};

/** 同仁在群組打這些字，機器人會回覆目前的待辦清單（免費）。 */
export const STAFF_QUERY_KEYWORDS = ['待辦', '待办', '清單', '未回覆', '有誰沒回'];

/**
 * 讀環境變數並去掉前後空白。
 *
 * 從網頁複製 token 再貼進部署平台時，很容易夾帶一個看不見的空白或換行。
 * 不清掉的話，LINE 會回「Authentication failed」這種完全看不出原因的錯誤，
 * 或是待辦頁面明明貼對通行碼卻一直 403。這個坑很難自己找出來。
 */
function env(key, fallback = '') {
  return (process.env[key] || fallback).trim();
}

export const LINE = {
  channelAccessToken: env('LINE_CHANNEL_ACCESS_TOKEN'),
  channelSecret: env('LINE_CHANNEL_SECRET'),
};

export const PORT = env('PORT') || 3000;

/**
 * 機器人對外的網址，例如 https://xxx.onrender.com
 * 圖片訊息要用它組出圖片的公開網址，LINE 只吃 HTTPS。
 */
export const PUBLIC_BASE_URL = env('PUBLIC_BASE_URL').replace(/\/+$/, '');

/** 待辦頁面的通行碼。同仁開 /admin?token=xxx 才看得到。 */
export const ADMIN_TOKEN = env('ADMIN_TOKEN');

/** 關鍵字比對分數低於此值就當作沒聽懂，走 fallback。 */
export const MATCH_THRESHOLD = 2;

export function assertConfig() {
  const missing = [];
  if (!LINE.channelAccessToken) missing.push('LINE_CHANNEL_ACCESS_TOKEN');
  if (!LINE.channelSecret) missing.push('LINE_CHANNEL_SECRET');
  if (!PUBLIC_BASE_URL) missing.push('PUBLIC_BASE_URL');
  if (!ADMIN_TOKEN) missing.push('ADMIN_TOKEN');

  if (missing.length) {
    throw new Error(
      `缺少環境變數：${missing.join(', ')}\n` +
        `請複製 .env.example 成 .env 並填入對應的值，詳見 README。`
    );
  }
}
