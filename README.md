# 宜蘭縣溪北輔具資源中心 LINE 機器人

民眾在 LINE 問輔具問題，機器人自動回答；非服務時間的留言會記下來，隔天早上提醒同仁回覆。

---

## 它會做什麼

| 情境 | 機器人的反應 |
|---|---|
| 民眾點下方選單 | 直接給對應的答案（補助流程還會附上流程圖） |
| 民眾打「我要借用」 | 比對關鍵字，回借用資訊 |
| **服務時間內**問問題 | 回答 + 附上建議按鈕 |
| **非服務時間**問問題 | 先說明現在沒有專人，再給答案，並告知何時回覆 |
| 非服務時間問到**需要專人**的題目 | 除了回答，還會記成一筆待辦 |
| 機器人看不懂 | 老實說看不懂，給按鈕和電話 |
| 每天早上 09:00 | 同仁群組收到待辦清單（有待辦才發） |
| 同仁在群組打「待辦」 | 隨時回覆目前的待辦清單（免費，不限次數） |

**民眾永遠不會收到主動推播。** 他們在留言的當下就已經被告知「專人會在 X 時間回覆您」，那是回覆不是推播。

服務時間、回覆內容、關鍵字**都不用改程式**，改設定檔就好（見下面）。

---

## 第一次設定

### 1. 申請 LINE Messaging API

1. 到 [LINE Developers](https://developers.line.biz/) 用中心的 LINE 帳號登入
2. 建立 Provider → 建立 **Messaging API** channel（要跟現有的官方帳號 `@188jxowa` 綁在一起）
3. 記下兩個值：
   - **Channel secret**（Basic settings 分頁）
   - **Channel access token**（Messaging API 分頁最下面，按 Issue）

### 2. 關掉會打架的功能

在 [LINE Official Account Manager](https://manager.line.biz/) → 設定 → 回應設定：

- **自動回應訊息**：關閉 ← 不關的話會跟機器人同時回，民眾會收到兩則
- **Webhook**：開啟
- **聊天**：開啟（同仁才能手動回覆民眾）

### 3. 填設定

```bash
cp .env.example .env
```

打開 `.env` 把值填進去。`ADMIN_TOKEN` 自己設一組亂碼：

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

### 4. 部署上線

機器人需要一台**能被 LINE 連到的 HTTPS 主機**。目前用 [Render](https://render.com/) 免費方案試跑：

1. 把這個資料夾推到 GitHub（`.env` 不會被上傳，`.gitignore` 擋掉了）
2. Render → New → Web Service → 選這個 repo
3. Build command：`npm install`，Start command：`npm start`
4. Instance Type 選 **Free**
5. Environment 頁面把 `.env` 裡的每一項貼進去
6. 部署完會拿到網址，例如 `https://fuju-bot.onrender.com` → 回填 `PUBLIC_BASE_URL`（Render 的 Environment 和本機的 `.env` 都要填）

### 4-1. 讓免費主機別睡著（免費方案必做）

Render 免費方案閒置 15 分鐘就休眠。休眠會造成兩個問題：民眾的第一則訊息要等 30 秒才有回應，而且**早上 9 點的待辦提醒不會準時發**（那時沒人傳訊息，機器人還在睡）。

用一個免費的外部定時服務每 10 分鐘戳它一下就解決了：

1. 到 [cron-job.org](https://cron-job.org/) 註冊（免費）
2. Create cronjob：
   - URL：`https://你的網址/healthz`
   - 執行間隔：每 **10** 分鐘
3. 存檔啟用

Render 免費方案每月有 750 小時額度，一個服務全天開著是 730 小時，剛好夠用。

> ⚠️ 免費方案**每次重新部署，`data/tickets.json` 就會清空**，還沒回覆的留言會消失。試跑期間可以接受，正式上線前請升級到 Starter 方案並掛 Persistent Disk。

### 5. 設定 Webhook 網址

回到 LINE Developers → Messaging API → Webhook URL 填：

```
https://你的網址/webhook
```

按 **Verify**，出現 Success 就成功了。

### 6. 上架圖文選單

選單圖片要自己準備，尺寸**必須是 2500 x 1686**：

- `assets/richmenu-template.svg` 是範本，格線跟程式對齊。用瀏覽器開啟另存成 PNG，或交給設計同仁重畫
- **每一格的位置不要動**，不然民眾會點到隔壁格
- 存成 `assets/richmenu.png`，然後：

```bash
npm run richmenu:deploy
```

### 7. 讓同仁收到待辦清單

1. 開一個 LINE 群組，把中心的官方帳號**和同仁**都拉進去
2. 在群組裡隨便講一句話，去 Render 的 Logs 頁面看，會印出：
   ```
   [webhook] 收到群組訊息，groupId = Cxxxxxxxxxxxxx（尚未設定 STAFF_GROUP_ID）
   ```
3. 把那串 `Cxxxxx` 填進 `.env` 和 Render 的 `STAFF_GROUP_ID`，重新部署

設好之後，同仁在群組打「**待辦**」機器人就會回覆目前的清單。

> 🔒 **這個群組 ID 決定了誰看得到民眾的留言。** 機器人只認這一個群組，其他群組打「待辦」一律不理。
> 所以不要把中心的官方帳號拉進非公務的群組，也不要把 `STAFF_GROUP_ID` 改成別的群組。

---

## 日常維護（同仁看這段就好）

### 改回覆內容 / 加關鍵字

改 `data/faq.json`，不用碰程式。每一則長這樣：

```json
{
  "id": "borrow",
  "title": "輔具借用",
  "keywords": ["借用", "我要借用", "借用時間", "借用方式"],
  "messages": [{ "type": "text", "text": "【輔具借用】..." }],
  "suggest": ["items", "center-info"],
  "needsHuman": true
}
```

- **民眾問了卻答不出來？** → 把他打的字加進 `keywords`
- **答案要改？** → 改 `messages` 裡的 `text`
- **文字裡可以用**：`{{name}}` `{{address}}` `{{phone}}` `{{lineId}}` `{{hours}}` `{{maps}}`，機器人會自動代換。中心電話改了只要改 `src/config.js` 一個地方

改完一定要跑這個檢查：

```bash
npm run check
```

它會告訴你哪裡寫錯、哪些關鍵字會互搶、哪些內容還沒確認。**沒有錯誤才可以上線。**

### 改服務時間

改 `src/config.js` 的 `BUSINESS_HOURS`：

```js
3: [['08:00', '12:00'], ['13:00', '17:00'], ['17:30', '19:30']],  // 週三有夜間
```

數字是星期幾（0=日、1=一 …… 6=六）。沒列到的日子就是休息。

國定假日加在 `holidays` 裡：

```js
holidays: ['2026-10-10', '2027-01-01'],
```

⚠️ 改完記得把 `humanReadable`（給民眾看的說明文字）一起改，否則機器人講的跟實際會對不起來。

### 處理待辦

有三個地方看得到待辦：

1. **每天早上 09:00**，同仁群組會自動收到清單（有待辦才發）
2. **在群組打「待辦」**，隨時查，不限次數也不花額度
3. **待辦網頁**，清單訊息裡有連結，手機也能開

**回覆完民眾後，記得回網頁點「已處理」**——機器人看不到你們在 LINE 後台的手動回覆，不點的話那筆會一直留著。等超過 2 天的會標上 ⚠️。

> 🔒 待辦網頁的連結**只在同仁群組裡傳**，不要貼到其他地方。通行碼就寫在網址上，拿到連結的人就看得到民眾留言。

---

## 幾件要知道的事

**機器人不知道你回過民眾了。**
LINE 不會把同仁在後台手動打的回覆通知給機器人。所以「已處理」一定要人去點。這不是 bug，是 LINE 的限制。

**額度怎麼算。**
LINE 只對「主動推播」計費，機器人「回覆」是免費且無上限的。這支機器人的設計是：

| 動作 | 算不算額度 |
|---|---|
| 回答民眾的問題（含非服務時間） | ❌ 不算，這是回覆 |
| 民眾點選單 | ❌ 不算 |
| 同仁在群組打「待辦」查清單 | ❌ 不算，這也是回覆 |
| **每天早上推待辦清單給同仁** | ✅ 算，**一天最多 1 則** |

以每月 22 個工作日估，最多用掉 22 則，免費額度是 200 則/月。沒有待辦的日子不會發，實際會更少。

要完全不花額度的話，把 `src/config.js` 的 `REMINDER.time` 改成 `null`，就只剩同仁打「待辦」查詢。

**目前是免費方案試跑，有兩個已知限制。**

第一，主機會休眠，所以要靠 cron-job.org 每 10 分鐘戳一次（見上面 4-1）。**那個 cronjob 不要停掉**，停了早上的提醒就不會準時發。

第二，**每次重新部署，`data/tickets.json` 就會清空**，還沒回覆的留言會消失。改 `faq.json` 內容也算重新部署，所以盡量趁沒有待辦的時候改。

正式上線前請升級 Render Starter（約 US$7/月）並掛 Persistent Disk（1GB 約 $0.25/月），這兩個問題就都沒了，cronjob 也可以停掉。

**待辦頁面的連結不要外流。**
通行碼就寫在網址上，拿到連結的人就看得到民眾留言。只在同仁群組裡傳。

---

## 內容還沒確認的部分

跑 `npm run check` 會列出來。目前有 4 則是**先寫成「請來電洽詢」**，因為我手上沒有正確資料——與其讓機器人講錯，不如先請民眾打電話：

| 題目 | 還缺什麼 |
|---|---|
| 輔具借用 | 期間 3 個月、免費、無押金、僅短期**已確認**。缺：可借品項、借用資格、要帶什麼證件、歸還方式 |
| 有哪些輔具 | 實際品項清單。民眾很常直接打「輪椅」兩個字，補上會很有用 |
| 評估預約 | 能不能線上預約？要帶什麼？多久？有沒有到府評估？ |
| 長照資格怎麼辦 | 已有長照資格者的正確申請管道 |

另外 **`src/config.js` 裡的平日上下班時間（08:00–12:00、13:00–17:00）是推測的**，只有週三夜間 17:30–19:30 是中心確認過的。上線前請務必核對，這個錯了民眾會白跑一趟。

補齊後把該則的 `"draft": true` 拿掉。

---

## 檔案在哪

```
├── data/faq.json          ← 回覆內容與關鍵字（同仁改這個）
├── src/config.js          ← 中心資料、服務時間、提醒設定
├── src/lib/matcher.js     關鍵字比對
├── src/lib/hours.js       服務時間判斷
├── src/lib/messages.js    訊息組裝
├── src/lib/store.js       待辦資料存取
├── src/lib/reminder.js    每天早上的提醒
├── src/handlers/webhook.js 收到訊息後怎麼處理
├── src/routes/admin.js    同仁的待辦頁面
├── scripts/check-faq.js   內容檢查（npm run check）
├── scripts/richmenu.js    圖文選單部署
├── assets/                選單圖片與範本
└── public/img/            要傳給民眾的圖片
```

## 指令

```bash
npm start              啟動
npm run dev            啟動（改檔案自動重開，開發用）
npm run check          檢查 faq.json
npm run richmenu:deploy 上架圖文選單
npm run richmenu:clear  移除圖文選單
```
