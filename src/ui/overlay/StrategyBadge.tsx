import { CATEGORIES, type Category, type PuntLevel, type StrategyState } from "@/shared/types";

interface Props {
  strategy: StrategyState;
  onTogglePunt?: (category: Category, level: PuntLevel) => void;
}

const NEXT_LEVEL: Record<PuntLevel, PuntLevel> = { none: "soft", soft: "hard", hard: "none" };

export function StrategyBadge({ strategy, onTogglePunt }: Props) {
  const suggesting = strategy.mode === "suggest";
  // In suggest mode the chips reflect what detection found, not what is applied.
  const shown = suggesting && strategy.suggestedPunts ? strategy.suggestedPunts : strategy.punts;
  const punted = CATEGORIES.filter((c) => shown[c] !== "none");

  return (
    <div>
      <div className="dc-section-title">Build · 信心 {Math.round(strategy.confidence * 100)}%</div>
      <div className="dc-tags">
        <span className={punted.length ? "dc-tag dc-tag-punt" : "dc-tag dc-tag-info"}>
          {punted.length ? "◆" : "●"} {strategy.buildLabel ?? "Balanced"}
        </span>
        <span className="dc-tag">
          {strategy.mode === "manual" ? "手動鎖定" : strategy.mode === "auto" ? "自動套用" : "僅建議・未套用"}
        </span>
      </div>
      {onTogglePunt && (
        <div className="dc-tags" role="group" aria-label="Punt 設定">
          {CATEGORIES.map((category) => {
            const level = shown[category];
            return (
              <button
                key={category}
                type="button"
                className={`dc-tag ${level === "hard" ? "dc-tag-punt" : level === "soft" ? "dc-tag-warn" : ""}`}
                style={{ cursor: "pointer", background: "transparent", opacity: suggesting && level !== "none" ? 0.7 : 1 }}
                title={suggesting ? `${category}: 建議 ${level}（未套用）— 點擊改為手動鎖定` : `${category}: ${level} — 點擊切換`}
                onClick={() => onTogglePunt(category, NEXT_LEVEL[level])}
              >
                {category}
                {level === "hard" ? " ✕" : level === "soft" ? " ~" : ""}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
