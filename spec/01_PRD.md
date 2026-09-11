# PRD — Fantasy Draft AI Copilot

## 1. 使用情境

使用者正在 Yahoo Fantasy Basketball 網頁 Draft Room 進行 Snake Draft。

他希望 Extension 像一位即時 Fantasy GM，在每一次選秀後自動更新：

- 下一手最佳選擇
- 次佳選擇
- 建隊缺口
- Punt strategy
- Category balance
- Position balance
- ADP value / reach

使用者不需要每次截圖詢問 ChatGPT。

---

## 2. Persona

主要使用者：
- 熟悉 Fantasy Basketball
- 使用 Yahoo Fantasy
- 玩 9-CAT H2H
- 需要即時決策
- 通常每個 pick 30–90 秒
- 希望比 Yahoo 預設排名更懂「Roster Fit」

---

## 3. 核心 Job-to-be-Done

> 當我正在 Draft，其他人持續選走球員時，我希望系統自動知道我的陣容、剩餘球員與 category 結構，立刻告訴我最該選誰，而且理由要跟「我的隊伍」有關，而不是只照總排名。

---

## 4. 功能需求

### FR-001 Draft State Detection
系統必須讀取：
- draft round
- pick number
- current pick
- my draft slot
- my team
- all picks
- available players
- timer（若可取得）

### FR-002 My Roster
即時建立：
- player_id
- name
- NBA team
- eligible positions
- draft round
- draft pick
- projected stats
- category z-scores

### FR-003 Available Players
至少保留：
- Yahoo rank
- name
- team
- positions
- availability
- optional ADP
- optional injury/status

### FR-004 Recommendation Engine
輸出：
- score 0–100
- rank
- fit score
- value score
- scarcity score
- category impact
- risk score
- confidence

### FR-005 Punt Detection
自動判斷：
- no punt
- soft punt
- hard punt

支援 category：
- FG%
- FT%
- 3PM
- PTS
- REB
- AST
- STL
- BLK
- TO

Punt 不可只因單一球員而自動鎖死。
必須支援使用者：
- Auto
- Manual
- Locked

### FR-006 Overlay
Yahoo draft page 顯示固定 panel。

正常模式：
- Best Pick
- Top 5
- Team Build
- Category bars
- Position needs
- round / next pick

快速模式（距離使用者 pick <= 3）：
- 只顯示 Top 3
- 大字 Best Pick
- 10–20 字理由
- 不顯示長篇 AI explanation

### FR-007 Manual Override
使用者可以：
- lock punt strategy
- pin player
- blacklist player
- manually mark player drafted
- manually correct roster
- change league settings

### FR-008 Data Import
支援 CSV / JSON player projections。

最低欄位：
- player_id 或 unique name
- name
- team
- positions
- GP
- FG%
- FT%
- 3PM
- PTS
- REB
- AST
- STL
- BLK
- TO

### FR-009 AI Explanation
LLM 只負責：
- 解釋 Top picks
- 比較兩位接近的候選人
- 生成一句話 draft advice

LLM 不應直接決定 player pool truth。

### FR-010 Session Persistence
draft tab reload 後，可恢復：
- league rules
- picks
- roster
- strategy
- blacklist
- pinned players

---

## 5. 非功能需求

### NFR-001 Latency
- DOM event -> normalized state <= 1.5 秒
- normalized state -> recommendation <= 500ms（本地）
- AI explanation <= 3 秒，不得阻塞推薦

### NFR-002 Reliability
如果 Yahoo selector 失效：
- 顯示 `Yahoo page parser error`
- 停止自動推薦或標記為 stale
- 不可假裝資料是最新

### NFR-003 Privacy
預設：
- 不傳 Yahoo cookie
- 不傳 Yahoo session token
- 不傳完整頁面 HTML 到 LLM
- 只傳 normalized basketball data

### NFR-004 Security
API key 不可硬編碼。
Extension 若直連 LLM：
- 僅支援 user-provided key
- storage 至少使用 chrome.storage.local
建議正式版使用 backend proxy。

### NFR-005 Maintainability
Yahoo DOM selector 必須集中於 adapter，不可散落在 UI / ranking engine。

---

## 6. 優先級

P0:
- DOM parser
- recommendation engine
- overlay
- roster state
- available state
- player projection import

P1:
- punt engine
- AI explanation
- mock simulator
- position scarcity

P2:
- auto queue
- one-click draft
- cloud sync
