# Risk / Safety / Platform Notes

## 1. Yahoo 網頁變動
最大技術風險是 Draft Room DOM 改版。

對策：
- adapter isolation
- DOM inspector
- parser fixture tests
- confidence score
- fail loudly

## 2. Virtualized list
可選球員列表可能只 render 可視區域。

不可把目前 DOM rows 當成完整 available pool。

建議：
- master player database
- drafted IDs subtraction
- Yahoo list 只做 sync / metadata

## 3. 自動點擊風險
完全 Auto Draft 可能：
- 誤選
- selector 改版後點錯
- 違反平台自動化規範

因此 MVP：
**Recommendation only + manual confirmation**

## 4. AI hallucination
LLM 不可自行創造：
- 球員
- stats
- availability
- ranking

候選人必須由 deterministic engine 提供。

## 5. Latency
快輪到使用者時 AI explanation 不應阻塞。
Best Pick 必須先顯示。

## 6. Projection quality
推薦品質高度依賴 projections。
必須允許更新 CSV / JSON。
