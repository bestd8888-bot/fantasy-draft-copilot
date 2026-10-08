import { CATEGORIES, NOTE_PRESETS, type NoteTag, type Recommendation } from "@/shared/types";

interface Props {
  recommendation: Recommendation;
  pinned: boolean;
  blacklisted: boolean;
  /** The user's standing note on this player, if any. */
  noteTag?: NoteTag;
  onSetNote: (tag: NoteTag | "clear") => void;
  onPin: () => void;
  onBlacklist: () => void;
  onMarkDrafted: () => void;
  onAddToRoster: () => void;
  onClose: () => void;
}

const COMPONENTS: { key: keyof Recommendation; label: string }[] = [
  { key: "baseValue", label: "Base value" },
  { key: "rosterFit", label: "Roster fit" },
  { key: "categoryNeed", label: "Category need" },
  { key: "puntFit", label: "Punt fit" },
  { key: "scarcity", label: "Scarcity" },
  { key: "adpValue", label: "ADP value" },
  { key: "upside", label: "Upside" },
  { key: "injuryRisk", label: "Injury risk" },
];

const NOTE_ORDER: NoteTag[] = ["target", "watch", "downgrade", "risk"];

export function CandidateDetail({
  recommendation,
  pinned,
  blacklisted,
  noteTag,
  onSetNote,
  onPin,
  onBlacklist,
  onMarkDrafted,
  onAddToRoster,
  onClose,
}: Props) {
  return (
    <div className="dc-detail">
      <div className="dc-best-head">
        <span className="dc-best-name" style={{ fontSize: 15 }}>
          #{recommendation.rank} {recommendation.playerName}
        </span>
        <button type="button" className="dc-iconbtn" onClick={onClose} aria-label="關閉細節">
          ✕
        </button>
      </div>
      <div className="dc-sub">
        {recommendation.positions.join("/")} · {recommendation.nbaTeam} · score {recommendation.score}
      </div>

      <div style={{ marginTop: 8 }}>
        {COMPONENTS.map(({ key, label }) => (
          <div className="dc-kv" key={key}>
            <span>{label}</span>
            <span>{((recommendation[key] as number) * 100).toFixed(0)}</span>
          </div>
        ))}
        <div className="dc-kv">
          <span>Reach</span>
          <span>{recommendation.reachLabel}</span>
        </div>
        <div className="dc-kv" title="你下一次能選時他還在的機率；20% 以下實際通常更低">
          <span>撐到下一手</span>
          <span>{Math.round(recommendation.survivalToNextPick * 100)}%</span>
        </div>
        {recommendation.projectedGames !== undefined && (
          <div className="dc-kv" title="預計出場數 / 這個球員池的健康基準；產量已按此比例折算">
            <span>預計出場</span>
            <span>
              {Math.round(recommendation.projectedGames)} 場
              {recommendation.referenceGames ? ` / ${Math.round(recommendation.referenceGames)}` : ""}
            </span>
          </div>
        )}
        {recommendation.marketMomentum !== undefined && (
          <div className="dc-kv" title="整季排名與近七天實際被選順位的落差">
            <span>市場動能</span>
            <span>
              {recommendation.marketMomentum > 0 ? "📈 +" : recommendation.marketMomentum < 0 ? "📉 " : ""}
              {(recommendation.marketMomentum * 100).toFixed(0)}
            </span>
          </div>
        )}
      </div>

      <div className="dc-section-title" style={{ marginTop: 8 }}>
        我的判斷（會跨場次保留）
      </div>
      <div className="dc-actions">
        {NOTE_ORDER.map((tag) => (
          <button
            key={tag}
            type="button"
            className={`dc-btn ${noteTag === tag ? "dc-btn-active" : ""}`}
            onClick={() => onSetNote(noteTag === tag ? "clear" : tag)}
          >
            {NOTE_PRESETS[tag].label}
          </button>
        ))}
      </div>

      <div className="dc-section-title" style={{ marginTop: 8 }}>
        Category impact (z)
      </div>
      <div className="dc-bars">
        {CATEGORIES.map((category) => {
          const z = recommendation.categoryZ[category] ?? 0;
          const width = Math.min(100, Math.abs(z) * 33);
          return (
            <div className="dc-bar" key={category}>
              <span className="dc-bar-label">{category}</span>
              <span className="dc-bar-track" aria-hidden="true">
                <span className={`dc-bar-fill ${z >= 0 ? "is-strong" : "is-weak"}`} style={{ width: `${width}%` }} />
              </span>
              <span className="dc-bar-value">
                {z >= 0 ? "+" : ""}
                {z.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="dc-actions">
        <button type="button" className={`dc-btn ${pinned ? "dc-btn-active" : ""}`} onClick={onPin}>
          {pinned ? "取消釘選" : "📌 釘選"}
        </button>
        <button type="button" className={`dc-btn ${blacklisted ? "dc-btn-active" : ""}`} onClick={onBlacklist}>
          {blacklisted ? "取消排除" : "🚫 排除"}
        </button>
        <button type="button" className="dc-btn" onClick={onMarkDrafted}>
          標記已被選走
        </button>
        <button type="button" className="dc-btn" onClick={onAddToRoster}>
          加入我的隊伍
        </button>
      </div>
    </div>
  );
}
