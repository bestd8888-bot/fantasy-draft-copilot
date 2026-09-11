# Yahoo Draft Room DOM Adapter 規格

## 1. 重要原則

Yahoo Draft Room UI 可能改版，因此：

1. 不要用大量脆弱的 nth-child selector
2. 優先：
   - aria-label
   - data-* attributes
   - role
   - stable class prefix
   - visible text pattern
3. selector 必須集中在 `selectors.ts`
4. parser 必須有 fallback
5. 建立 Dev Inspector mode

---

## 2. Selector config

```ts
export const yahooSelectors = {
  draftBoard: [
    '[data-test*="draft"]',
    '[aria-label*="Draft"]',
    // runtime discovered fallbacks
  ],

  playerRows: [],
  myTeamMarker: [],
  timer: [],
  roundLabel: [],
  resultsPanel: [],
};
```

實際 selector 不應先猜死。
第一版請建立 DOM Inspector 讓開發者在真實 Draft Room 校正。

---

## 3. DOM Inspector

Developer mode 顯示：

- 所有可能的 player row
- innerText sample
- attributes
- nearest clickable button
- candidate selectors
- selector hit count

並可 export：

```json
{
  "capturedAt": "...",
  "url": "...",
  "elements": [...]
}
```

注意：export 前清除 cookie / token / user private identifiers。

---

## 4. Player name normalization

處理：
- Jr.
- III
- II
- accents
- apostrophe
- hyphen

需建立 normalized key：

```ts
normalizeName("Nikola Jokić") -> "nikola jokic"
```

但 UI 必須保留原名。

---

## 5. Draft event detection

MutationObserver 觀察：
- draft board container
- drafted player count
- current pick indicator
- user roster

避免監聽整個 document subtree 若造成高 CPU。

Pseudo：

```ts
const observer = new MutationObserver(
  debounce(() => {
    const snapshot = adapter.snapshot();
    if (hasMeaningfulChange(previous, snapshot)) {
      onDraftStateChange(snapshot);
    }
  }, 200)
);
```

---

## 6. Available player strategy

優先順序：

A. 若頁面一次 render 完整 available player dataset：
- 直接 parse

B. 若使用 virtualized list：
- 不可假設 DOM 只有可見 rows 就是完整 player pool
- 建立 scroll harvesting 或讀取頁面 state（若合法且可取得）
- 或使用外部 player database 減去 drafted players 得到 available pool

建議 MVP：
**Player master database - drafted player IDs = available pool**

Yahoo UI 只負責同步 drafted players。

---

## 7. Duplicate protection

DraftPick unique key：
```text
sessionId + overallPick
```

Player unique key：
```text
providerPlayerId
```
若無 provider ID：
```text
normalizedName + NBAteam
```

---

## 8. Parser health

```ts
interface ParserHealth {
  boardFound: boolean;
  pickCount: number;
  rosterFound: boolean;
  currentPickFound: boolean;
  confidence: number;
  warnings: string[];
}
```

confidence < 0.6 時 UI 顯示黃色警告。
confidence < 0.35 時停止推薦。
