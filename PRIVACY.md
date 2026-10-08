# 隱私權政策 · Privacy Policy

**Fantasy Draft AI Copilot** · 最後更新 / Last updated: 2026-10-08

Fantasy Draft AI Copilot 與 Yahoo 沒有任何關聯，也未獲得 Yahoo 的認可。
Fantasy Draft AI Copilot is not affiliated with or endorsed by Yahoo.

---

## 繁體中文

### 擴充功能讀取什麼
只有在 Yahoo Fantasy Basketball 選秀室頁面（`basketball.fantasysports.yahoo.com`）上，擴充功能才會讀取畫面上的內容：可選球員清單與投影數據、選秀進度（輪次、順位、計時器）、你的陣容。這些資料只在你的瀏覽器內用來計算推薦。

### 存在哪裡
所有資料都存在你電腦上的 Chrome 本機儲存空間（`chrome.storage.local`），不會上傳到任何伺服器：
- 你的設定（聯盟規則、權重等）
- 選秀進度與球員數據的快取，讓你重新整理分頁後可以接續
- 你對球員的標記（看好／看衰／風險）
- 你自行匯入的球員投影檔案
- 選用：你自己的 AI API key

### 我們不做的事
- 不收集、不傳送任何資料給開發者
- 沒有分析追蹤、沒有廣告、不販售任何資料
- 不讀取、不傳送 Yahoo 的 cookie、登入 session 或帳號資訊
- 不會幫你在選秀室裡點擊或選人

### 選用的 AI 解釋功能
這個功能**預設關閉**。只有你在設定頁啟用、並填入**你自己的** OpenAI API key 之後，擴充功能才會在推薦更新時，用你的 key 把以下資料送到 OpenAI（`api.openai.com`），換回一句推薦說明：
- 聯盟隊數、計分方式、目前輪次與順位
- 你陣容中的球員名字
- 前 5 名候選人的名字、位置、推薦分數、對各 category 的影響
- 你的 punt 設定

不會送出頁面 HTML、cookie、Yahoo 帳號或任何個人身分資訊。這些資料由 OpenAI 依其隱私權政策處理。關閉功能或刪除 key 後就不再送出。

### 開發者工具匯出
「DOM Inspector」報告只有在你手動點擊時才會產生，並以檔案形式存到你的電腦，匯出前會移除 email、長串識別碼與網址查詢參數。不會自動上傳。

### 刪除資料
在 `chrome://extensions` 移除擴充功能，Chrome 會一併刪除它存的所有本機資料。

### 聯絡
問題或回報：https://github.com/bestd8888-bot/fantasy-draft-copilot/issues

---

## English

### What the extension reads
Only on Yahoo Fantasy Basketball draft room pages (`basketball.fantasysports.yahoo.com`), the extension reads what is shown on screen: the available-player list and projections, draft progress (round, pick, timer) and your roster. This is used inside your browser to compute recommendations.

### Where data is stored
Everything is kept in Chrome's local storage on your computer (`chrome.storage.local`) and never uploaded to a server: your settings, a cache of draft progress and player projections so a reload can resume, your player notes, any projection file you import, and — optionally — your own AI API key.

### What we do not do
- No data is collected by or sent to the developer.
- No analytics, no advertising, no sale of data.
- Yahoo cookies, login sessions and account details are never read or transmitted.
- The extension never clicks or drafts on your behalf.

### Optional AI explanations
**Off by default.** Only if you enable it in settings and supply **your own** OpenAI API key, the extension sends the following to OpenAI (`api.openai.com`) with your key to get a one-line explanation: league size, scoring type, current round and pick; the names of players on your roster; the names, positions, scores and category effects of the top 5 candidates; and your punt settings. No page HTML, cookies, Yahoo account or personal identifiers are sent. OpenAI processes this under its own privacy policy. Disabling the feature or removing the key stops it.

### Developer export
The "DOM Inspector" report is created only when you click it, is saved as a file on your computer, and is stripped of emails, long identifiers and URL query strings first. It is never uploaded automatically.

### Deleting your data
Removing the extension at `chrome://extensions` deletes all data it stored.

### Contact
https://github.com/bestd8888-bot/fantasy-draft-copilot/issues
