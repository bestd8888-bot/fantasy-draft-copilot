import { CATEGORIES, type Category, type StrategyState } from "@/shared/types";

interface Props {
  percentiles: Record<Category, number>;
  strategy: StrategyState;
  /** Categories this league scores; others are not shown. */
  categories?: Category[];
}

const BAR_WIDTH = 9;

/** Text bar mirrors the visual bar so colour is never the only signal. */
function textBar(value: number): string {
  const filled = Math.round((value / 100) * BAR_WIDTH);
  return "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
}

export function CategoryStrength({ percentiles, strategy, categories }: Props) {
  const shown = categories?.length ? CATEGORIES.filter((c) => categories.includes(c)) : CATEGORIES;
  return (
    <div>
      <div className="dc-section-title">
        Category strength（我的隊伍）{shown.length !== CATEGORIES.length ? ` · ${shown.length} 項計分` : ""}
      </div>
      <div className="dc-bars">
        {shown.map((category) => {
          const value = percentiles[category] ?? 50;
          const punt = strategy.punts[category];
          const modifier = punt !== "none" ? "is-punt" : value >= 70 ? "is-strong" : value <= 35 ? "is-weak" : "";
          return (
            <div className="dc-bar" key={category} title={`${category} ${value}/100 ${textBar(value)}`}>
              <span className="dc-bar-label">{category}</span>
              <span className="dc-bar-track" aria-hidden="true">
                <span className={`dc-bar-fill ${modifier}`} style={{ width: `${value}%` }} />
              </span>
              <span className="dc-bar-value" aria-label={`${category} ${value}`}>
                {value}
                {punt === "hard" ? " ✕" : punt === "soft" ? " ~" : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
