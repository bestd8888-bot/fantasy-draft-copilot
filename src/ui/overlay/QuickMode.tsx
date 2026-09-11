import type { Recommendation } from "@/shared/types";
import { BestPickCard } from "./BestPickCard";
import { CandidateList } from "./CandidateList";

interface Props {
  recommendations: Recommendation[];
  picksUntilMe?: number;
  secondsRemaining?: number;
  onSelect: (playerId: string) => void;
  pinned: string[];
}

/**
 * Shown when the user is within `quickModeThreshold` picks: three names, one
 * short reason, nothing to read.
 */
export function QuickMode({ recommendations, picksUntilMe, secondsRemaining, onSelect, pinned }: Props) {
  const [best, ...rest] = recommendations.slice(0, 3);
  if (!best) return null;

  return (
    <>
      <div className="dc-banner dc-banner-warn" role="status">
        <strong>
          {picksUntilMe === 0 ? "⏰ 輪到你了" : `⏱ 還有 ${picksUntilMe} 手輪到你`}
          {secondsRemaining !== undefined ? ` · ${secondsRemaining}s` : ""}
        </strong>
      </div>
      <BestPickCard recommendation={best} aiStatus="disabled" quickMode onSelect={() => onSelect(best.playerId)} />
      <div className="dc-reason">{best.shortReason}</div>
      <CandidateList recommendations={rest} pinned={pinned} onSelect={onSelect} compact />
    </>
  );
}
