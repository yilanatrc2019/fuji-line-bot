import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MATCH_THRESHOLD } from '../config.js';

const FAQ_PATH = fileURLToPath(new URL('../../data/faq.json', import.meta.url));

let faq = load();

function load() {
  const raw = JSON.parse(readFileSync(FAQ_PATH, 'utf8'));
  return raw.entries;
}

/** 給測試和 npm run check 用；正式跑的時候 FAQ 只在啟動時讀一次。 */
export function reload() {
  faq = load();
  return faq;
}

export function allEntries() {
  return faq;
}

export function getEntry(id) {
  return faq.find((e) => e.id === id) || null;
}

/**
 * 把民眾打的字正規化，讓「補助 ?」「補助？」「ㄅㄨˇ助」之類的差異不影響比對。
 * 全形轉半形、去標點空白、英文轉小寫。
 */
export function normalize(text) {
  return text
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ')
    .toLowerCase()
    .replace(/[\s，。、？！~,.?!:：；;「」『』()（）\-_]/g, '');
}

/**
 * 找出最符合的一則 FAQ。
 *
 * 作法是「關鍵字有沒有出現在民眾的句子裡」，命中的關鍵字越長分數越高，
 * 因為長關鍵字（「借用時間」）比短的（「借」）更能代表民眾真正要問什麼。
 * 中文沒有空白可以斷詞，硬要斷詞反而容易出錯，這種比對法對這個規模夠用又好維護。
 *
 * @returns {{ entry: object, score: number, hits: string[] } | null}
 */
export function match(text) {
  const q = normalize(text);
  if (!q) return null;

  const scored = faq
    .map((entry) => {
      const hits = entry.keywords.filter((k) => q.includes(normalize(k)));
      const score = hits.reduce((sum, k) => Math.max(sum, normalize(k).length), 0);
      return { entry, score, hits };
    })
    .filter((r) => r.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score || b.hits.length - a.hits.length);

  return scored[0] || null;
}

/**
 * 分數相近的其他選項，用來在機器人沒把握時讓民眾自己挑。
 * @returns {object[]} 其他可能的 entry，最多 3 則
 */
export function alternatives(text, best) {
  if (!best) return [];
  const q = normalize(text);

  return faq
    .filter((e) => e.id !== best.entry.id)
    .map((entry) => {
      const hits = entry.keywords.filter((k) => q.includes(normalize(k)));
      const score = hits.reduce((sum, k) => Math.max(sum, normalize(k).length), 0);
      return { entry, score };
    })
    .filter((r) => r.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((r) => r.entry);
}
