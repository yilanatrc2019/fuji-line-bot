import express from 'express';
import { middleware, messagingApi } from '@line/bot-sdk';
import { fileURLToPath } from 'node:url';

import { LINE, PORT, PUBLIC_BASE_URL, ADMIN_TOKEN, assertConfig } from './config.js';
import { createHandler } from './handlers/webhook.js';
import { startScheduler } from './lib/reminder.js';
import { isOpen } from './lib/hours.js';
import adminRouter from './routes/admin.js';

assertConfig();

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: LINE.channelAccessToken,
});

const app = express();
const handleEvent = createHandler(client);

/**
 * Webhook 一定要放在 express.json() 前面。
 * LINE 的簽章驗證要算原始 body 的雜湊，body 一旦被 json() 解析過就驗不過了。
 */
app.post('/webhook', middleware({ channelSecret: LINE.channelSecret }), async (req, res) => {
  // 先回 200 再處理。LINE 規定要在 10 秒內回應，超過就會判定失敗並重送。
  res.sendStatus(200);

  const events = req.body.events || [];
  for (const event of events) {
    await handleEvent(event);
  }
});

app.use(express.urlencoded({ extended: false }));

// 圖片訊息的來源。LINE 只接受 HTTPS 網址，所以正式環境一定要走 HTTPS。
app.use('/img', express.static(fileURLToPath(new URL('../public/img', import.meta.url)), {
  maxAge: '7d',
}));

app.use('/admin', adminRouter);

app.get('/healthz', (req, res) => {
  res.json({ ok: true, open: isOpen(), now: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[server] 已啟動，port ${PORT}`);
  console.log(`[server] 現在${isOpen() ? '是' : '不是'}服務時間`);
  console.log(`[server] Webhook 網址請填：${PUBLIC_BASE_URL}/webhook`);
  console.log(`[server] 同仁待辦清單：${PUBLIC_BASE_URL}/admin?token=${ADMIN_TOKEN}`);
  startScheduler(client);
});
