import type { Recommendation } from "@/shared/types";

interface Props {
  recommendations: Recommendation[];
  selectedId?: string;
  pinned: string[];
  onSelect: (playerId: string) => void;
  compact?: boolean;
}

export function CandidateList({ recommendations, selectedId, pinned, onSelect, compact }: Props) {
  if (recommendations.length === 0) return null;
  return (
    <div>
      {!compact && <div className="dc-section-title">其他候選人</div>}
      <ul className="dc-list">
        {recommendations.map((rec) => (
          <li key={rec.playerId}>
            <button
              type="button"
              className="dc-row"
              style={selectedId === rec.playerId ? { borderColor: "var(--dc-info)" } : undefined}
              onClick={() => onSelect(rec.playerId)}
            >
              <span className="dc-row-rank">{rec.rank}</span>
              <span className="dc-row-name">
                {pinned.includes(rec.playerId) ? "📌 " : ""}
                {(rec.noteAdjustment ?? 0) > 0 ? "★ " : (rec.noteAdjustment ?? 0) < 0 ? "☆ " : ""}
                {rec.playerName}
              </span>
              {!compact && <span className="dc-row-pos">{rec.positions.join("/")}</span>}
              <span className="dc-score">{rec.score}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
