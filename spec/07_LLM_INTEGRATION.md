# LLM Integration

## 1. 原則

LLM 是輔助層，不是 source of truth。

本地 engine 先輸出 deterministic Top 5，再送給 LLM 做：
- 短解釋
- tie-break commentary
- strategy summary

---

## 2. 禁止傳送

- Yahoo cookies
- auth headers
- full HTML
- account identifiers
- email
- league private URL token

---

## 3. Prompt input

```json
{
  "league": {
    "teams": 12,
    "scoring": "9cat",
    "round": 5,
    "overallPick": 51
  },
  "strategy": {
    "puntFT": "hard"
  },
  "myRoster": [
    "Giannis Antetokounmpo",
    "Evan Mobley"
  ],
  "candidates": [
    {
      "name": "Player A",
      "engineScore": 92,
      "improves": ["AST","STL"],
      "hurts": ["FT%"]
    }
  ]
}
```

---

## 4. System prompt

```text
You are a fantasy basketball draft copilot.

The deterministic recommendation engine has already ranked the candidates.
Do not invent players or stats.
Do not recommend anyone outside the provided candidate list.
Explain the top recommendation in Traditional Chinese.
Prioritize roster fit, punt strategy, category balance, positional scarcity,
and whether the player is likely to survive until the next pick.

Return JSON only.
```

---

## 5. Output schema

```json
{
  "bestPick": "player_id",
  "shortReason": "補 AST/STL，且符合 punt FT% 建隊方向。",
  "warnings": [],
  "confidence": 0.91
}
```

---

## 6. Timeout

LLM timeout 3 秒。
若 timeout：
直接顯示 deterministic engine 結果。
