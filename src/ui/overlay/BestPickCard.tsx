import type { AiExplanation, Recommendation } from "@/shared/types";

interface Props {
  recommendation: Recommendation;
  ai?: AiExplanation;
  aiStatus: "idle" | "loading" | "error" | "disabled";
  quickMode?: boolean;
  onSelect?: () => void;
}

export function BestPickCard({ recommendation, ai, aiStatus, quickMode, onSelect }: Props) {
  const aiMatches = ai?.bestPick === recommendation.playerId;
  const survival = Math.round(recommendation.survivalToNextPick * 100);
  const momentum = recommendation.marketMomentum ?? 0;

  return (
    <div className="dc-best" onClick={onSelect} role={onSelect ? "button" : undefined} tabIndex={onSelect ? 0 : undefined}>
      <div className="dc-section-title">🔥 Best pick</div>
      <div className="dc-best-head">
        <span className="dc-best-name">{recommendation.playerName}</span>
        <span className="dc-score">{recommendation.score}/100</span>
      </div>
      <div className="dc-sub">
        {recommendation.positions.join("/") || "—"} · {recommendation.nbaTeam || "—"}
        {recommendation.adp !== undefined ? ` · ADP ${recommendation.adp.toFixed(0)}` : ""}
        {recommendation.projectedGames !== undefined ? ` · ${Math.round(recommendation.projectedGames)} 場` : ""}
      </div>

      <div className="dc-tags">
        {recommendation.improves.map((c) => (
          <span className="dc-tag dc-tag-good" key={`up-${c}`}>
            ↑ {c}
          </span>
        ))}
        {recommendation.hurts.map((c) => (
          <span className="dc-tag dc-tag-bad" key={`down-${c}`}>
            ↓ {c}
          </span>
        ))}
        <span className={`dc-tag ${recommendation.reachLabel === "Great Value" ? "dc-tag-good" : recommendation.reachLabel.includes("Reach") ? "dc-tag-warn" : ""}`}>
          {recommendation.reachLabel}
        </span>
        <span
          className={`dc-tag ${survival < 20 ? "dc-tag-warn" : "dc-tag-info"}`}
          title="你下一次能選時他還在的機率。低段偏樂觀：顯示 20% 以下時，實際通常更低，當作會被搶走。"
        >
          撐到下一手 {survival}%
        </span>
        {momentum >= 0.35 && (
          <span className="dc-tag dc-tag-warn" title="近七天被選順位明顯早於整季排名">
            📈 市場追捧
          </span>
        )}
        {momentum <= -0.35 && (
          <span className="dc-tag" title="近七天被選順位明顯晚於整季排名">
            📉 市場降溫
          </span>
        )}
        {recommendation.projectedGames !== undefined && recommendation.projectedGames < 62 && (
          <span className="dc-tag dc-tag-warn" title="預計出場數偏低，產量已依此折算">
            ⚠️ 只 {Math.round(recommendation.projectedGames)} 場
          </span>
        )}
        {(recommendation.noteAdjustment ?? 0) !== 0 && (
          <span className="dc-tag dc-tag-punt">
            {(recommendation.noteAdjustment ?? 0) > 0 ? "★ 我看好" : "☆ 我看衰"}
          </span>
        )}
      </div>

      {!quickMode && (
        <div className="dc-reason">
          {aiMatches && ai ? ai.shortReason : recommendation.shortReason}
          {aiMatches && ai ? <span className="dc-tag dc-tag-info" style={{ marginLeft: 6 }}>AI</span> : null}
        </div>
      )}
      {!quickMode && aiStatus === "loading" && <div className="dc-sub">AI 解釋產生中…（不影響推薦）</div>}
    </div>
  );
}
