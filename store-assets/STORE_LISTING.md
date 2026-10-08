# Chrome Web Store 上架資料

照 [開發人員資訊主頁](https://chrome.google.com/webstore/devconsole) 的分頁順序排列，每格直接複製貼上。

---

## 0. 上傳套件

**新增項目 → 上傳**：`release/fantasy-draft-copilot.zip`

（用 `npm run package:store` 產生的商店版，內容腳本只在 Yahoo 選秀室執行。）

---

## 1. 商店資訊（Store listing）

### 說明（Description）

```
選秀時，即時算出最該選誰。

Fantasy Draft AI Copilot 會在 Yahoo Fantasy Basketball 選秀室右側顯示推薦面板，根據你目前的陣容、九項 category（9-CAT）、位置缺口與稀缺性，排出當下最適合你的球員 —— 不是只看總排名。

【功能】
• Best Pick 與前 5 名候選人，每一位都能展開完整分數拆解
• 九項 category 強弱即時更新：FG%、FT%、3PM、PTS、REB、AST、STL、BLK、TO
• FG% / FT% 依出手量加權，不會高估投很少的高命中率球員
• 依預計出場場數折算，常缺賽的球員不會被高估
• 位置稀缺性：估算到你下一手前，各位置還剩多少好球員
• 「撐到下一手」機率：這個人現在不拿，下一輪還在的機會
• 建隊方向偵測（例如 punt FT%），只建議、不擅自改變分數
• 你可以標記球員「鎖定目標 / 看好 / 看衰 / 風險」，跨場次保留
• 快輪到你時自動切換成精簡模式

【不需要設定】
不用匯入任何資料。外掛直接讀取 Yahoo 選秀室畫面上的球員清單和投影數據。

【安全與隱私】
• 只讀取畫面，絕不會幫你按 Draft
• 推薦引擎完全在你的電腦上運算
• 不收集、不上傳任何資料，沒有廣告與追蹤
• 只在 basketball.fantasysports.yahoo.com 上執行
• 原始碼公開：https://github.com/bestd8888-bot/fantasy-draft-copilot

【使用建議】
選秀開始前先打開 Players 分頁，讓外掛記下所有球員的數據。到外掛設定頁確認你的聯盟隊數。

本擴充功能與 Yahoo 無任何關聯，也未獲得 Yahoo 的認可。Yahoo 與 Yahoo Fantasy 為其各自所有者的商標。
```

### 類別（Category）
**娛樂（Entertainment）**。後台的類別清單如果不同，選最接近的。

### 語言（Language）
**中文（繁體）**

### 圖片

| 欄位 | 檔案 |
| --- | --- |
| 商店圖示（Store icon，128×128） | `public/icons/icon128.png` |
| 螢幕截圖（1280×800） | `store-assets/screenshot-1-recommend.png`<br>`store-assets/screenshot-2-breakdown.png`<br>`store-assets/screenshot-3-settings.png` |
| 小型宣傳圖塊（Small promo tile，440×280） | `store-assets/promo-tile-440x280.png` |

截圖裡的球員是內建的示範資料，不是真實 NBA 球員。

### 其他欄位
- **官方網址 / Homepage URL**：`https://github.com/bestd8888-bot/fantasy-draft-copilot`
- **支援網址 / Support URL**：`https://github.com/bestd8888-bot/fantasy-draft-copilot/issues`

---

## 2. 隱私權（Privacy practices）

### 單一用途說明（Single purpose）
```
在 Yahoo Fantasy Basketball 選秀室中，依據使用者的陣容與聯盟規則，即時顯示該選哪位球員的推薦。
Shows real-time player recommendations inside Yahoo Fantasy Basketball draft rooms, based on the user's roster and league settings.
```

### 權限理由（Permission justification）

**storage**
```
在本機儲存使用者的聯盟設定、球員標記，以及選秀進度與球員數據的快取，讓使用者重新整理選秀室分頁後能接續使用。資料不會離開使用者的電腦。
Stores the user's league settings, player notes, and a cache of draft progress so the panel can resume after the draft tab is reloaded. Data stays on the user's computer.
```

**主機權限 / Host permission：`https://basketball.fantasysports.yahoo.com/*`**
```
擴充功能唯一的用途是在 Yahoo Fantasy Basketball 選秀室顯示推薦，需要讀取這個網域上的選秀畫面（球員清單、投影數據、選秀進度、使用者陣容）並在頁面上顯示推薦面板。不會在其他任何網站執行。
The extension's only purpose is showing recommendations in the Yahoo Fantasy Basketball draft room. It reads the draft page on this host (player list, projections, draft progress, the user's roster) and displays a panel on it. It runs on no other site.
```

### 遠端程式碼（Remote code）
**否，我沒有使用遠端程式碼。** 所有程式碼都打包在套件內。

### 資料使用（Data usage）
勾選 **「網站內容」（Website content）** 一項，其餘不勾。

原因：預設不會傳送任何資料。但使用者如果自行啟用選用的 AI 解釋功能並填入自己的 OpenAI API key，球員名字與推薦分數會送到 OpenAI。照實申報比較安全，隱私權政策裡寫了完整細節。

三項聲明全部勾選：
- ☑ 不會將使用者資料出售或轉讓給第三方（核准的用途除外）
- ☑ 不會將使用者資料用於與單一用途無關的目的
- ☑ 不會將使用者資料用於判斷信用或放款

### 隱私權政策網址（Privacy policy URL）
```
https://github.com/bestd8888-bot/fantasy-draft-copilot/blob/master/PRIVACY.md
```

---

## 3. 發布（Distribution）

- **可見度**：**公開（Public）**，商店裡搜尋得到。如果只想讓拿到連結的人安裝，選「不公開（Unlisted）」。審核流程兩者一樣。
- **地區**：所有地區
- **價格**：免費

---

## 4. 審核測試說明（Test instructions）

擴充功能只會在 Yahoo 選秀室內出現，審核人員需要知道怎麼觸發，不然容易以「無法驗證功能」退件。

```
The extension only activates inside a Yahoo Fantasy Basketball draft room.

How to test with any free Yahoo account:
1. Go to https://basketball.fantasysports.yahoo.com/ and sign in.
2. Open the Mock Draft Lobby and join any 12-team mock draft (free, no league needed).
3. When the draft room opens, the panel "Fantasy Draft AI GM" appears on the right side.
4. Keep the "Players" tab open. As picks are made, the panel updates its Best Pick and category bars.
5. Click any candidate to see the full score breakdown.

The extension never clicks or drafts on the user's behalf. Settings are available from the toolbar icon.
```
