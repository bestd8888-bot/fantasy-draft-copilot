# 系統架構

## 1. 架構圖

```text
Yahoo Draft Room
      │
      ▼
Content Script
      │
      ├── DOM Parser
      ├── MutationObserver
      └── Yahoo Adapter
      │
      ▼
Normalized Draft State
      │
      ├── Player Database
      ├── Projection Engine
      ├── Category Engine
      ├── Punt Engine
      ├── Scarcity Engine
      └── Recommendation Engine
      │
      ▼
Recommendation Result
      │
      ├── Overlay UI
      └── Optional LLM Explanation
```

---

## 2. Chrome Extension modules

```text
src/
  background/
    serviceWorker.ts

  content/
    index.ts
    yahoo/
      YahooDraftAdapter.ts
      selectors.ts
      parser.ts
      observer.ts

  domain/
    draft/
      DraftState.ts
      DraftPick.ts
      LeagueSettings.ts
    player/
      Player.ts
      Projection.ts
    recommendation/
      RecommendationEngine.ts
      scoring.ts
      scarcity.ts
      punt.ts
      zscore.ts

  store/
    useDraftStore.ts
    persistence.ts

  ui/
    overlay/
      OverlayApp.tsx
      BestPickCard.tsx
      CandidateList.tsx
      CategoryStrength.tsx
      StrategyBadge.tsx
      QuickMode.tsx

  options/
    OptionsApp.tsx

  shared/
    types.ts
    schema.ts
    logger.ts
```

---

## 3. Adapter pattern

禁止 ranking engine 直接 query DOM。

Interface：

```ts
export interface DraftPlatformAdapter {
  detect(): boolean;
  getLeagueSettings(): Partial<LeagueSettings>;
  getDraftMeta(): DraftMeta;
  getDraftedPlayers(): DraftPick[];
  getAvailablePlayers(): PlatformPlayer[];
  getMyRoster(): PlatformPlayer[];
  subscribe(cb: () => void): () => void;
}
```

Yahoo 是第一個 adapter。

未來可擴充 ESPN / Fantrax。

---

## 4. Normalized State

```ts
interface DraftState {
  platform: "yahoo";
  sessionId: string;
  league: LeagueSettings;

  currentRound: number;
  currentPick: number;
  myDraftSlot?: number;
  nextMyPick?: number;
  picksUntilMe?: number;

  drafted: DraftPick[];
  myRoster: RosterPlayer[];
  available: Player[];

  strategy: StrategyState;
  updatedAt: number;

  parserStatus: "ok" | "partial" | "error";
}
```

---

## 5. Data flow

每次 MutationObserver 觸發：

```text
DOM changed
  ↓
debounce 150–300ms
  ↓
YahooDraftAdapter.parse()
  ↓
validate with Zod
  ↓
diff old/new state
  ↓
if meaningful change:
    recommendationEngine.calculate()
  ↓
render overlay
  ↓
async LLM explanation
```

不要每一個 DOM mutation 都 call LLM。

---

## 6. Failure isolation

如果其中一個 selector 壞掉：

- timer 壞：recommendation 仍可運作
- ADP 壞：value component 降權
- available list 壞：停止推薦
- roster 壞：切到 manual roster / partial mode

所有 parser field 應有 confidence。
