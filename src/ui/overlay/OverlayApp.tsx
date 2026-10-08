import { useCallback, useEffect, useRef, useState } from "react";
import { useDraftStore } from "@/store/useDraftStore";
import { NOTE_PRESETS, type Category, type NoteTag, type PlayerNote, type PuntLevel } from "@/shared/types";
import { BestPickCard } from "./BestPickCard";
import { CandidateDetail } from "./CandidateDetail";
import { CandidateList } from "./CandidateList";
import { CategoryStrength } from "./CategoryStrength";
import { QuickMode } from "./QuickMode";
import { StrategyBadge } from "./StrategyBadge";

export interface MockControls {
  onSimulatePick: () => void;
  onDraftBest: () => void;
  onReset: () => void;
  isMyTurn: boolean;
}

interface Props {
  mockControls?: MockControls;
  onOpenInspector?: () => void;
}

export function OverlayApp({ mockControls, onOpenInspector }: Props) {
  const state = useDraftStore((s) => s.state);
  const result = useDraftStore((s) => s.result);
  const ai = useDraftStore((s) => s.ai);
  const aiStatus = useDraftStore((s) => s.aiStatus);
  const overrides = useDraftStore((s) => s.overrides);
  const settings = useDraftStore((s) => s.settings);
  const quickMode = useDraftStore((s) => s.quickMode);
  const selectedPlayerId = useDraftStore((s) => s.selectedPlayerId);
  const lastError = useDraftStore((s) => s.lastError);

  const select = useDraftStore((s) => s.select);
  const togglePin = useDraftStore((s) => s.togglePin);
  const toggleBlacklist = useDraftStore((s) => s.toggleBlacklist);
  const markDrafted = useDraftStore((s) => s.markDrafted);
  const addToMyRoster = useDraftStore((s) => s.addToMyRoster);
  const setPunt = useDraftStore((s) => s.setPunt);
  const setNote = useDraftStore((s) => s.setNote);
  const notes = useDraftStore((s) => s.notes);

  const [collapsed, setCollapsed] = useState(settings.overlayCollapsed);
  const { position, onPointerDown } = useDrag();

  const onTogglePunt = useCallback((category: Category, level: PuntLevel) => setPunt(category, level), [setPunt]);

  if (!state) {
    return (
      <div className="dc-root" style={position}>
        <header className="dc-header" onPointerDown={onPointerDown}>
          <span className="dc-title">Fantasy Draft AI GM</span>
        </header>
        <div className="dc-body">
          <div className="dc-banner dc-banner-info">正在偵測 Draft Room…</div>
        </div>
      </div>
    );
  }

  const health = state.parserHealth;
  const disabled = health.confidence < 0.35;
  const stale = !disabled && health.confidence < 0.6;
  // The pool can come from an imported file or straight off the draft page, so
  // judge by what the engine actually has, not by whether an import happened.
  const missingProjections =
    state.available.length > 0 && state.available.every((p) => !p.projection);
  const recommendations = result?.recommendations ?? [];
  // Players drafted before the extension saw them have no projection, so the
  // category bars silently cover only part of the roster unless we say so.
  const rosterWithoutData = state.myRoster.filter((p) => !p.projection).length;
  const best = recommendations[0];
  const selected = recommendations.find((r) => r.playerId === selectedPlayerId);

  if (collapsed) {
    return (
      <div className="dc-root dc-collapsed" style={position}>
        <header className="dc-header" onPointerDown={onPointerDown}>
          <span className="dc-title">
            {best ? `🔥 ${best.playerName} ${best.score}` : "Draft AI GM"}
          </span>
          <button type="button" className="dc-iconbtn" onClick={() => setCollapsed(false)} aria-label="展開">
            ▾
          </button>
        </header>
      </div>
    );
  }

  return (
    <div className={`dc-root ${quickMode ? "dc-quick" : ""}`} style={position}>
      <header className="dc-header" onPointerDown={onPointerDown}>
        <div style={{ flex: 1 }}>
          <div className="dc-title">Fantasy Draft AI GM</div>
          <div className="dc-meta">
            Round {state.currentRound} · Pick {state.currentPick}
            {state.picksUntilMe !== undefined ? ` · 你的 pick 還有 ${state.picksUntilMe} 手` : " · 尚未設定 draft slot"}
          </div>
        </div>
        {onOpenInspector && (
          <button type="button" className="dc-iconbtn" onClick={onOpenInspector} title="匯出 DOM inspector 報告">
            🔍
          </button>
        )}
        <button type="button" className="dc-iconbtn" onClick={() => setCollapsed(true)} aria-label="收合">
          ▴
        </button>
      </header>

      <div className="dc-body">
        {disabled && (
          <div className="dc-banner dc-banner-error" role="alert">
            <strong>⛔ Yahoo page parser error</strong>
            <div>無法可靠讀取 Draft Room（confidence {health.confidence.toFixed(2)}），已停止推薦以免給出錯誤建議。</div>
          </div>
        )}
        {stale && (
          <div className="dc-banner dc-banner-warn" role="status">
            ⚠️ Draft data may be stale — Yahoo page structure changed (confidence {health.confidence.toFixed(2)})
          </div>
        )}
        {(state.configWarnings ?? []).map((warning) => (
          <div className="dc-banner dc-banner-error" key={warning} role="alert">
            {warning}
          </div>
        ))}
        {rosterWithoutData > 0 && (
          <div className="dc-banner dc-banner-info">
            你的陣容有 {rosterWithoutData} 名球員沒有數據（外掛啟動前就被選走），Category 強弱只計算{" "}
            {state.myRoster.length - rosterWithoutData} 名。
          </div>
        )}
        {health.warnings.slice(0, 2).map((warning) => (
          <div className="dc-banner dc-banner-warn" key={warning}>
            {warning}
          </div>
        ))}
        {missingProjections && (
          <div className="dc-banner dc-banner-warn">
            Projection unavailable — using ranking-only fallback. 請到設定頁匯入 CSV/JSON。
          </div>
        )}
        {aiStatus === "error" && settings.llm.enabled && (
          <div className="dc-banner dc-banner-info">AI explanation unavailable — recommendation engine still active.</div>
        )}
        {lastError && <div className="dc-banner dc-banner-warn">{lastError}</div>}

        {!disabled && quickMode && (
          <QuickMode
            recommendations={recommendations}
            picksUntilMe={state.picksUntilMe}
            secondsRemaining={state.secondsRemaining}
            pinned={overrides.pinned}
            onSelect={select}
          />
        )}

        {!disabled && !quickMode && (
          <>
            {best && (
              <BestPickCard
                recommendation={best}
                ai={ai}
                aiStatus={aiStatus}
                onSelect={() => select(best.playerId)}
              />
            )}
            <CandidateList
              recommendations={recommendations.slice(1, 6)}
              selectedId={selectedPlayerId}
              pinned={overrides.pinned}
              onSelect={select}
            />
            {result && <StrategyBadge strategy={result.strategy} onTogglePunt={onTogglePunt} />}
            {result && <CategoryStrength percentiles={result.categoryPercentiles} strategy={result.strategy} />}
          </>
        )}

        {selected && (
          <CandidateDetail
            recommendation={selected}
            pinned={overrides.pinned.includes(selected.playerId)}
            blacklisted={overrides.blacklisted.includes(selected.playerId)}
            noteTag={tagOf(notes[selected.playerId])}
            onSetNote={(tag) => setNote(selected.playerId, selected.playerName, tag)}
            onPin={() => togglePin(selected.playerId)}
            onBlacklist={() => toggleBlacklist(selected.playerId)}
            onMarkDrafted={() => {
              markDrafted(selected.playerId);
              select(undefined);
            }}
            onAddToRoster={() => {
              addToMyRoster(selected.playerId);
              select(undefined);
            }}
            onClose={() => select(undefined)}
          />
        )}

        {mockControls && (
          <div>
            <div className="dc-section-title">Mock draft</div>
            <div className="dc-mock">
              <button type="button" className="dc-btn" onClick={mockControls.onSimulatePick}>
                模擬下一手
              </button>
              <button type="button" className="dc-btn" onClick={mockControls.onDraftBest} disabled={!best}>
                {mockControls.isMyTurn ? "選走 Best Pick" : "替我選 Best Pick"}
              </button>
              <button type="button" className="dc-btn" onClick={mockControls.onReset}>
                重設
              </button>
            </div>
          </div>
        )}
      </div>

      <footer className="dc-footer">
        <span className={`dc-dot ${disabled ? "is-bad" : stale ? "is-warn" : ""}`} aria-hidden="true" />
        <span>
          parser {health.confidence.toFixed(2)} · {state.drafted.length} picks · {state.available.length} available
        </span>
        <span style={{ marginLeft: "auto" }}>{result ? `${result.durationMs.toFixed(0)}ms` : "—"}</span>
      </footer>
    </div>
  );
}

/** Maps a stored note back to the preset it came from, for the active button. */
function tagOf(note: PlayerNote | undefined): NoteTag | undefined {
  if (!note) return undefined;
  return (Object.keys(NOTE_PRESETS) as NoteTag[]).find(
    (tag) => NOTE_PRESETS[tag].adjustment === note.adjustment && Boolean(NOTE_PRESETS[tag].risk) === Boolean(note.risk),
  );
}

/** Lets the user drag the panel out of the way of the draft board. */
function useDrag() {
  const [position, setPosition] = useState<{ top?: number; left?: number; right?: number }>({});
  const origin = useRef<{ x: number; y: number; top: number; left: number } | null>(null);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!origin.current) return;
      setPosition({
        top: Math.max(0, origin.current.top + event.clientY - origin.current.y),
        left: Math.max(0, origin.current.left + event.clientX - origin.current.x),
        right: undefined,
      });
    };
    const onUp = () => {
      origin.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const rect = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect) return;
    origin.current = { x: event.clientX, y: event.clientY, top: rect.top, left: rect.left };
  }, []);

  return { position, onPointerDown };
}
