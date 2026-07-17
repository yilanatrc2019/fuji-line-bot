import express from 'express';
import { ADMIN_TOKEN, BUSINESS_HOURS, CENTER } from '../config.js';
import { listOpen, markDone } from '../lib/store.js';
import { getEntry } from '../lib/matcher.js';

/**
 * 同仁的待辦頁面。
 *
 * 用網址裡的 token 當通行碼，沒有做帳號密碼登入 —— 這頁只有中心同仁會從
 * LINE 群組的連結點進來，內容也只有留言預覽，沒有個資檔案。
 * 但也因為 token 就寫在網址上，這個連結請不要外流（見 README）。
 */

const router = express.Router();

function checkToken(req, res, next) {
  const token = req.query.token || req.body?.token;
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    return res.status(403).type('html').send(page('無法存取', `
      <div class="empty">
        <p>連結不正確或已失效。</p>
        <p class="hint">請向管理者索取正確的待辦清單連結。</p>
      </div>
    `));
  }
  next();
}

// 這頁不該被 Google 收錄。
router.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});

router.get('/', checkToken, (req, res) => {
  const tickets = listOpen();
  res.type('html').send(page('待辦留言', renderList(tickets, req.query.token)));
});

router.post('/done/:id', checkToken, (req, res) => {
  markDone(req.params.id);
  res.redirect(`/admin?token=${encodeURIComponent(req.body.token)}`);
});

function renderList(tickets, token) {
  if (!tickets.length) {
    return `<div class="empty">
      <p class="big">✅ 目前沒有待回覆的留言</p>
      <p class="hint">民眾在非服務時間留言、而且需要專人處理時，會自動出現在這裡。</p>
    </div>`;
  }

  const cards = tickets.map((t) => {
    const topic = t.topic ? getEntry(t.topic)?.title : null;
    const msgs = t.messages
      .map(
        (m) => `<div class="msg">
          <time>${fmt(m.at)}</time>
          <p>${escapeHtml(m.text)}</p>
        </div>`
      )
      .join('');

    return `<article class="card">
      <header>
        <strong>${escapeHtml(t.displayName)}</strong>
        ${topic ? `<span class="tag">${escapeHtml(topic)}</span>` : `<span class="tag warn">看不懂的問題</span>`}
      </header>
      <div class="msgs">${msgs}</div>
      <form method="POST" action="/admin/done/${t.id}">
        <input type="hidden" name="token" value="${escapeHtml(token)}">
        <button type="submit">已處理，從清單移除</button>
      </form>
    </article>`;
  });

  return `<p class="count">共 <strong>${tickets.length}</strong> 筆待回覆</p>${cards.join('')}`;
}

function fmt(iso) {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: BUSINESS_HOURS.timeZone,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function page(title, body) {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}｜${escapeHtml(CENTER.name)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 16px;
    font-family: system-ui, -apple-system, "Noto Sans TC", sans-serif;
    background: #f4f6f8; color: #1a1a1a;
    line-height: 1.6;
  }
  h1 { font-size: 1.25rem; margin: 0 0 4px; }
  .sub { color: #666; font-size: .85rem; margin: 0 0 20px; }
  .count { color: #666; font-size: .9rem; }
  .card {
    background: #fff; border-radius: 12px; padding: 16px; margin-bottom: 14px;
    box-shadow: 0 1px 3px rgba(0,0,0,.08);
  }
  .card header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
  .tag {
    font-size: .75rem; padding: 2px 8px; border-radius: 999px;
    background: #e3f2fd; color: #1565c0;
  }
  .tag.warn { background: #fff3e0; color: #e65100; }
  .msgs { border-left: 3px solid #e0e0e0; padding-left: 12px; margin-bottom: 14px; }
  .msg + .msg { margin-top: 10px; }
  .msg time { font-size: .75rem; color: #888; }
  .msg p { margin: 2px 0 0; white-space: pre-wrap; word-break: break-word; }
  button {
    width: 100%; padding: 12px; font-size: 1rem; font-weight: 600;
    color: #fff; background: #06c755; border: 0; border-radius: 8px; cursor: pointer;
  }
  button:active { background: #05a648; }
  .empty { text-align: center; padding: 48px 16px; color: #666; }
  .empty .big { font-size: 1.1rem; color: #1a1a1a; }
  .hint { font-size: .85rem; color: #888; }
</style>
</head>
<body>
  <h1>待辦留言</h1>
  <p class="sub">${escapeHtml(CENTER.name)}</p>
  ${body}
</body>
</html>`;
}

export default router;
