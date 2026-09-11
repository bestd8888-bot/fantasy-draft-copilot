# Test Plan

## 1. Unit tests

### Name normalization
- Nikola Jokić
- Nikola Jokic
- Jaren Jackson Jr.
- Jaren Jackson Jr

### Z-score
- counting stat
- TO inverse
- percentage volume impact

### Punt
- no punt
- soft punt
- hard punt

### Draft snake calculation
12-team:
- round 1 pick 3
- round 2 pick 22
- round 3 pick 27

---

## 2. Recommendation tests

Case A:
Roster:
- Giannis
- Sengun

Expected:
- FT recovery cost high
- punt FT soft suggestion
- high-FT-only value should not dominate

Case B:
Roster has 5 bigs, 1 guard
Expected:
- guard roster fit bonus
- another low-assist C penalized

Case C:
Candidate ADP 30 at pick 60
Expected:
- value bonus

Case D:
Candidate projected rank 25 but 90% likely to survive to next pick
Expected:
- can defer if another scarce target exists

---

## 3. Parser tests

建立 fixture HTML：

```text
tests/fixtures/yahoo/
  draft-room-v1.html
  draft-room-v2.html
  virtualized-list.html
  parser-broken.html
```

每次 Yahoo 改版：
- 保存 sanitized fixture
- 修 selector
- regression test

---

## 4. E2E

Playwright:
- load local fixture
- extension inject overlay
- simulate pick
- MutationObserver detects
- candidate removed
- recommendation recalculates

---

## 5. Performance

1000 players:
- recommendation < 100ms preferred
- < 500ms required

Observer:
- no continuous high CPU
- debounce required

---

## 6. Acceptance tests

AT-01:
drafted player 不可再出現在 Top 5。

AT-02:
refresh 後 roster 可恢復。

AT-03:
AI API 掛掉，Top 5 仍正常。

AT-04:
parser confidence < .35，recommendation 標記 stale / disabled。

AT-05:
picksUntilMe <= 3，自動切 Quick Mode。
