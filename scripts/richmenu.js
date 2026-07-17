import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { messagingApi } from '@line/bot-sdk';
import { LINE } from '../src/config.js';
import { getEntry } from '../src/lib/matcher.js';

/**
 * 圖文選單（民眾聊天室下方那個選單）的部署工具。
 *
 *   npm run richmenu:deploy   建立選單並設成預設
 *   npm run richmenu:clear    把所有選單刪掉
 *
 * 選單圖片放在 assets/richmenu.png，尺寸必須是 2500 x 1686。
 * 底下 AREAS 的座標要跟圖片上的格子對齊，改圖就要一起改這裡。
 */

const IMAGE_PATH = fileURLToPath(new URL('../assets/richmenu.png', import.meta.url));

const WIDTH = 2500;
const HEIGHT = 1686;
const COL = Math.floor(WIDTH / 3); // 833
const ROW = Math.floor(HEIGHT / 2); // 843

/** 3 欄 x 2 列。順序是左上 → 右上 → 左下 → 右下。 */
const AREAS = [
  { id: 'apply-flow', x: 0, y: 0 },
  { id: 'borrow', x: COL, y: 0 },
  { id: 'assessment', x: COL * 2, y: 0 },
  { id: 'items', x: 0, y: ROW },
  { id: 'center-info', x: COL, y: ROW },
  { id: 'contact-human', x: COL * 2, y: ROW },
];

const client = new messagingApi.MessagingApiClient({ channelAccessToken: LINE.channelAccessToken });
const blobClient = new messagingApi.MessagingApiBlobClient({ channelAccessToken: LINE.channelAccessToken });

function buildMenu() {
  return {
    size: { width: WIDTH, height: HEIGHT },
    selected: true,
    name: '輔具中心主選單',
    chatBarText: '點我看選單', // 選單收起來時，下方那條要顯示什麼字
    areas: AREAS.map((a, i) => {
      const entry = getEntry(a.id);
      if (!entry) throw new Error(`faq.json 裡找不到 id「${a.id}」，選單第 ${i + 1} 格會壞掉`);

      return {
        // 最右邊那欄補上除不盡的餘數，否則右側會有幾 px 點不到。
        bounds: {
          x: a.x,
          y: a.y,
          width: a.x === COL * 2 ? WIDTH - COL * 2 : COL,
          height: ROW,
        },
        action: {
          type: 'postback',
          label: entry.title,
          data: `faq=${entry.id}`,
          displayText: entry.title,
        },
      };
    }),
  };
}

async function clear() {
  const { richmenus } = await client.getRichMenuList();
  if (!richmenus.length) {
    console.log('沒有任何選單，不用清。');
    return;
  }
  for (const menu of richmenus) {
    await client.deleteRichMenu(menu.richMenuId);
    console.log(`已刪除：${menu.name}（${menu.richMenuId}）`);
  }
}

async function deploy() {
  if (!existsSync(IMAGE_PATH)) {
    console.error(
      `\n❌ 找不到選單圖片：assets/richmenu.png\n\n` +
        `   請先準備一張 2500 x 1686 的 PNG 放到 assets/ 資料夾。\n` +
        `   assets/richmenu-template.svg 是照著程式裡的格線畫的範本，\n` +
        `   可以用瀏覽器開啟後另存圖片，或交給設計同仁重畫（格子位置要一樣）。\n`
    );
    process.exit(1);
  }

  // 舊選單不刪掉的話會一直累積，而且 LINE 有數量上限。
  await clear();

  const menu = buildMenu();
  const { richMenuId } = await client.createRichMenu(menu);
  console.log(`已建立選單：${richMenuId}`);

  const image = readFileSync(IMAGE_PATH);
  await blobClient.setRichMenuImage(richMenuId, new Blob([image], { type: 'image/png' }));
  console.log('已上傳選單圖片');

  await client.setDefaultRichMenu(richMenuId);
  console.log('已設為預設選單');

  console.log('\n✅ 完成。請用手機打開官方帳號的聊天室確認（可能要幾分鐘才會更新）。\n');
}

const cmd = process.argv[2];

try {
  if (cmd === 'deploy') await deploy();
  else if (cmd === 'clear') await clear();
  else {
    console.log('用法：\n  npm run richmenu:deploy\n  npm run richmenu:clear');
    process.exit(1);
  }
} catch (err) {
  console.error('\n❌ 失敗：', err.body ? JSON.stringify(err.body, null, 2) : err.message);
  process.exit(1);
}
