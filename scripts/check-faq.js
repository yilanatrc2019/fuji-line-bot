import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { allEntries, normalize, match } from '../src/lib/matcher.js';

/**
 * 檢查 faq.json 有沒有寫錯。同仁改完內容後跑 npm run check。
 * 這支不會改任何東西，只會告訴你哪裡怪怪的。
 */

const entries = allEntries();
const errors = [];
const warnings = [];
const drafts = [];

const ids = new Set();
for (const e of entries) {
  if (ids.has(e.id)) errors.push(`id 重複：「${e.id}」出現不只一次`);
  ids.add(e.id);

  if (!e.title) errors.push(`「${e.id}」沒有 title`);
  if (!e.keywords?.length) errors.push(`「${e.id}」沒有任何 keywords，民眾永遠打不到這則`);
  if (!e.messages?.length) errors.push(`「${e.id}」沒有 messages，回覆會是空的`);

  if (e.messages?.length > 5) {
    errors.push(`「${e.id}」有 ${e.messages.length} 則訊息，LINE 一次最多 5 則`);
  }

  for (const m of e.messages || []) {
    if (m.type === 'text') {
      if (!m.text?.trim()) errors.push(`「${e.id}」有一則空白的文字訊息`);
      if (m.text?.length > 4900) {
        errors.push(`「${e.id}」的文字太長（${m.text.length} 字），LINE 上限 5000 字`);
      }
      for (const [, key] of m.text?.matchAll(/\{\{(\w+)\}\}/g) || []) {
        if (!['name', 'address', 'phone', 'lineId', 'hours', 'maps'].includes(key)) {
          errors.push(`「${e.id}」用了不存在的變數 {{${key}}}`);
        }
      }
    } else if (m.type === 'image') {
      const path = fileURLToPath(new URL(`../public/img/${m.file}`, import.meta.url));
      if (!existsSync(path)) errors.push(`「${e.id}」要用的圖片找不到：public/img/${m.file}`);
    } else {
      errors.push(`「${e.id}」有不認得的訊息類型：${m.type}（只能用 text 或 image）`);
    }
  }

  for (const s of e.suggest || []) {
    if (!entries.some((x) => x.id === s)) {
      errors.push(`「${e.id}」的建議按鈕指向不存在的 id：「${s}」`);
    }
  }
  if (e.suggest?.length > 4) {
    warnings.push(`「${e.id}」有 ${e.suggest.length} 個建議按鈕，只會顯示前 4 個`);
  }

  if (e.draft) drafts.push(e);
}

// 關鍵字互搶：A 的關鍵字打進去卻回到 B，通常是短關鍵字（像「借」）造成的。
for (const e of entries) {
  for (const k of e.keywords || []) {
    const result = match(k);
    if (result && result.entry.id !== e.id) {
      warnings.push(
        `民眾打「${k}」（你設定在「${e.title}」）會回到「${result.entry.title}」—— 兩則的關鍵字互搶`
      );
    }
    if (normalize(k).length < 2) {
      warnings.push(`「${e.id}」的關鍵字「${k}」只有 1 個字，很容易誤判`);
    }
  }
}

const line = '─'.repeat(50);
console.log(`\n檢查 faq.json：共 ${entries.length} 則\n${line}`);

if (errors.length) {
  console.log(`\n❌ 錯誤 ${errors.length} 個（要修好才能上線）`);
  errors.forEach((e) => console.log(`   ・${e}`));
}

if (warnings.length) {
  console.log(`\n⚠️  提醒 ${warnings.length} 個（不影響運作，但建議看一下）`);
  warnings.forEach((w) => console.log(`   ・${w}`));
}

if (drafts.length) {
  console.log(`\n📝 內容還沒確認的有 ${drafts.length} 則：`);
  drafts.forEach((d) => {
    console.log(`   ・${d.title}（${d.id}）`);
    if (d._待確認) console.log(`     ${d._待確認}`);
  });
}

if (!errors.length && !warnings.length && !drafts.length) {
  console.log('\n✅ 全部正常，可以上線。');
}

console.log(`\n${line}\n`);
process.exit(errors.length ? 1 : 0);
