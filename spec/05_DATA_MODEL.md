# Data Model

## LeagueSettings

```ts
interface LeagueSettings {
  teams: number;
  draftType: "snake" | "linear";
  scoring: "9cat" | "8cat" | "points" | "roto";

  categories: Category[];

  rosterSlots: {
    PG?: number;
    SG?: number;
    G?: number;
    SF?: number;
    PF?: number;
    F?: number;
    C?: number;
    UTIL?: number;
    BN?: number;
    IL?: number;
  };

  secondsPerPick?: number;
}
```

## Player

```ts
interface Player {
  id: string;
  providerIds?: {
    yahoo?: string;
  };

  name: string;
  normalizedName: string;
  nbaTeam: string;

  positions: string[];

  rank?: number;
  adp?: number;

  projection?: Projection;

  injuryStatus?: string;
  tags?: string[];
}
```

## Projection

```ts
interface Projection {
  gp: number;
  mpg?: number;

  fgm?: number;
  fga?: number;
  fgPct?: number;

  ftm?: number;
  fta?: number;
  ftPct?: number;

  threes: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
}
```

## StrategyState

```ts
interface StrategyState {
  mode: "auto" | "manual";
  punts: Record<Category, "none" | "soft" | "hard">;
  lockedCategories: Category[];

  buildLabel?: string;
  confidence: number;
}
```

## DraftPick

```ts
interface DraftPick {
  overall: number;
  round: number;
  pickInRound: number;

  teamId?: string;
  isMine: boolean;

  playerId: string;
  playerName: string;

  timestamp?: number;
}
```
