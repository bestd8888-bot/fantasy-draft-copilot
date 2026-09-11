# Fantasy Draft AI Copilot — 開發需求包

版本：v1.0  
目標平台：macOS + Chrome + Yahoo Fantasy Basketball 網頁版  
主要模式：**只讀 Draft Room + 即時推薦 + 人工確認選秀**

> 核心原則：第一版不自動替使用者按下 Draft，避免誤選與網站自動化限制。後續可加入「Auto Queue」與「One-click Draft」作為可選功能，但預設關閉。

---

## 1. 產品目標

建立一個 Chrome Extension，在 Yahoo Fantasy Basketball Draft Room 中即時讀取：

- 目前輪次 / Pick
- 使用者選秀順位
- 已選球員
- 可選球員清單
- 使用者已選陣容
- 球員位置
- Yahoo 顯示排名 / ADP（若畫面可取得）
- 下一次使用者 Pick 距離幾個選秀順位
- Draft timer

系統每次 Draft Board 改變後，自動重新計算，並在 Yahoo Draft Room 畫面上顯示：

1. **Best Pick**
2. **Top 3 / Top 5 建議**
3. 每位球員推薦分數
4. 為什麼適合目前陣容
5. 目前建隊策略（例如 Punt FT%）
6. Category Strength / Weakness
7. Position scarcity
8. 下一輪可能還在的候選人
9. 是否 Reach / Value Pick
10. 快輪到使用者時的極簡模式

---

## 2. MVP 定義

### 必做
- Chrome Extension Manifest V3
- Yahoo Draft Room DOM 資料擷取
- MutationObserver 即時偵測 Draft 更新
- 使用者 roster 追蹤
- Available players 追蹤
- 9-CAT recommendation engine
- Punt strategy detection
- Overlay UI
- Top 3 即時推薦
- 本地設定頁
- 手動輸入聯盟規則備援
- AI API optional（推薦核心不可完全依賴 LLM）
- Mock / Test Mode

### MVP 不做
- 自動登入 Yahoo
- 繞過 Yahoo 安全機制
- 自動下單式 Draft
- 任何未經授權帳號存取
- 依賴私人 / undocumented Yahoo API 作為唯一資料來源

---

## 3. 建議技術棧

- TypeScript
- React
- Vite
- Chrome Extension Manifest V3
- Zustand
- Zod
- Vitest
- Playwright
- IndexedDB / chrome.storage.local
- Optional backend:
  - Node.js / Fastify 或 Next.js API route
- Optional LLM:
  - OpenAI API
  - 只負責「解釋」與 tie-break，不應是 ranking engine 唯一來源

---

## 4. 開發順序

1. 完成 Draft DOM Inspector
2. 建立 Yahoo adapter
3. 建立 normalized draft state
4. 建立 recommendation engine
5. 加入 overlay
6. 加入 strategy/punt engine
7. 加入 player projections import
8. 加入 AI explanation
9. 加入測試
10. 再考慮 Auto Queue / One-click Draft

---

## 5. 完成條件

正式 Draft 過程中，當其他球員完成選擇後：

- 2 秒內偵測 Draft Board 更新
- 3 秒內完成推薦更新
- Best Pick 顯示不晚於下一個 pick 開始後 3 秒
- recommendation 不可包含已被選走球員
- recommendation 不可違反 roster slot 規則
- 同一 draft session 不可重複將同一球員視為 available
- Yahoo DOM selector 失效時要顯示錯誤，而不是靜默產生錯誤推薦
