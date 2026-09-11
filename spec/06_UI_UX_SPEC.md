# UI / UX 規格

## 1. Overlay layout

桌面右側浮動 panel：

```text
┌─────────────────────────────┐
│ Fantasy Draft AI GM         │
│ Round 5 · Pick 49           │
│ Your pick in: 3             │
├─────────────────────────────┤
│ 🔥 BEST PICK                │
│ Jalen Williams        92/100│
│ AST ↑ STL ↑ FT% ↑           │
│ Fits punt-FT build           │
├─────────────────────────────┤
│ 2 Evan Mobley          88    │
│ 3 Derrick White        86    │
│ 4 ...                        │
├─────────────────────────────┤
│ BUILD: Punt FT%              │
│ FG  █████████ 90             │
│ FT  ░░░░░░░░░ 18 (punt)     │
│ 3P  █████░░░░ 52             │
│ PTS ███████░░ 74             │
│ REB █████████ 91             │
│ AST ████░░░░░ 45             │
│ STL █████░░░░ 58             │
│ BLK ████████░ 84             │
└─────────────────────────────┘
```

---

## 2. Quick Mode

當 `picksUntilMe <= 3`：

```text
┌────────────────────────┐
│ YOUR PICK IN 2         │
│                       │
│ 🔥 JALEN WILLIAMS      │
│                       │
│ 2. MOBLEY              │
│ 3. WHITE               │
└────────────────────────┘
```

不要顯示長篇文字。

---

## 3. 色彩語意

- 綠：改善 category
- 黃：中立 / 風險
- 紅：惡化 / parser error
- 紫：Punt / Strategy
- 藍：一般 recommendation

不要依賴顏色作為唯一資訊，需有 label / icon。

---

## 4. Candidate detail

點擊候選人：

- score breakdown
- projected category impact
- roster fit
- ADP
- reach
- next-pick survival
- reason
- blacklist
- pin

---

## 5. Settings

- League teams
- Scoring
- Categories
- Roster slots
- Draft slot
- Pick timer
- Punt mode
- Player projection source
- AI provider
- API key
- Recommendation weights
- Quick Mode threshold

---

## 6. Error states

### Parser stale
`Draft data may be stale — Yahoo page structure changed.`

### Missing projection
`Projection unavailable — using ranking-only fallback.`

### AI unavailable
`AI explanation unavailable — recommendation engine still active.`

AI 失效不能讓 recommendation 消失。
