# Recommendation Engine 規格

## 1. 目標

不是「誰排名最高」，而是：

> 哪個 available player 對目前 roster + punt strategy + draft round + roster construction 最有價值。

---

## 2. Candidate Score

```text
FinalScore =
  BaseValue        * 0.35 +
  RosterFit        * 0.22 +
  CategoryNeed     * 0.15 +
  PuntFit          * 0.10 +
  Scarcity         * 0.08 +
  ADPValue         * 0.05 +
  Upside           * 0.03 -
  InjuryRisk       * 0.02
```

所有權重可在 options 調整。

---

## 3. Base Value

使用 projections 計算 9-CAT z-score。

Counting stats：
- 3PM
- PTS
- REB
- AST
- STL
- BLK

Percentage：
- FG%
- FT%

Turnover：
- 低 TO 越好，因此 sign 反轉。

---

## 4. Percentage category impact

不可直接對 FG% 做普通 z-score。

建議使用 volume-adjusted impact：

```text
FGImpact = (playerFG% - leagueAvgFG%) * playerFGA
FTImpact = (playerFT% - leagueAvgFT%) * playerFTA
```

再 standardize。

---

## 5. Punt

如果 category = hard punt：
- 該 category weight = 0

soft punt：
- weight *= 0.25 ~ 0.5

locked：
- 使用者設定優先於 auto detection

---

## 6. Auto Punt Detection

需要避免第一輪過早判定。

建議：
- Round 1：不鎖
- Round 2：只提示
- Round >= 3：允許 soft punt
- Round >= 5：若 evidence 高可 hard punt

Evidence 可包含：
- roster projected FT% category rank
- recovery cost
- player availability
- current roster archetype

例：

```text
Giannis + Sengun + Mobley
=> FT% projected bottom 10%
=> recovery would require multiple high-volume elite FT guards
=> soft/hard punt candidate
```

---

## 7. Category Need

計算目前 roster 在各 category 的 projected percentile。

```ts
categoryNeed[c] = 1 - percentile[c]
```

但 punt category 不補。

---

## 8. Roster Fit

包含：
- category synergy
- position eligibility
- usage / role diversification
- excess category penalty
- roster slots

例如 roster 已有 5 個 PF/C：
- 另一個純 C 要降低 fit
- 可打 PG/SG 的 multi-position guard 加分

---

## 9. Position Scarcity

不是只看位置數量。

需要估計：
```text
Scarcity(position) =
  quality remaining now -
  expected quality available at my next pick
```

若本輪剩 7 個高價 PG，但下一輪預計剩 1 個：
PG scarcity 應提高。

---

## 10. ADP Value

```text
valueDiff = playerADP - currentOverallPick
```

例：
ADP 45，現在 pick 60：
+15 value

但禁止 ADP 主導 recommendation。

---

## 11. Reach

輸出：
- Great Value
- Fair
- Slight Reach
- Major Reach

可基於：
- current pick
- ADP
- engine rank
- next pick survival probability

---

## 12. Survival Probability

估計球員是否能等到下一手：

```text
P(available next pick)
```

初版 heuristic：
- ADP vs next pick
- current rank
- recent draft tendency

若 P < 20%，現在想要就應該拿。

---

## 13. Recommendation output

```ts
interface Recommendation {
  playerId: string;
  score: number;
  rank: number;

  baseValue: number;
  rosterFit: number;
  categoryNeed: number;
  puntFit: number;
  scarcity: number;
  adpValue: number;
  upside: number;
  injuryRisk: number;

  reachLabel: string;
  survivalToNextPick: number;

  improves: Category[];
  hurts: Category[];

  shortReason: string;
}
```
