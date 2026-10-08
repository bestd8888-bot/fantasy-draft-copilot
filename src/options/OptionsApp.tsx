import { useEffect, useMemo, useState } from "react";
import { parseProjections } from "@/domain/player/import";
import { buildDemoPool } from "@/domain/player/demoPool";
import {
  CATEGORIES,
  DEFAULT_SETTINGS,
  type AppSettings,
  type EngineWeights,
  type PlayerNote,
  type PuntLevel,
  type RosterSlot,
} from "@/shared/types";
import {
  loadNotes,
  loadPlayers,
  loadSettings,
  savePlayers,
  saveNotes,
  saveSettings,
  type PlayersMeta,
} from "@/store/persistence";

const SLOTS: RosterSlot[] = ["PG", "SG", "G", "SF", "PF", "F", "C", "UTIL", "BN", "IL"];
const WEIGHT_LABELS: Record<keyof EngineWeights, string> = {
  baseValue: "Base value",
  rosterFit: "Roster fit",
  categoryNeed: "Category need",
  puntFit: "Punt fit",
  scarcity: "Scarcity",
  adpValue: "ADP value",
  upside: "Upside",
  injuryRisk: "Injury risk",
};

export function OptionsApp() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [meta, setMeta] = useState<PlayersMeta | undefined>();
  const [pasted, setPasted] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "bad" | "warn"; text: string } | undefined>();
  const [loaded, setLoaded] = useState(false);
  const [notes, setNotes] = useState<Record<string, PlayerNote>>({});

  useEffect(() => {
    void (async () => {
      setSettings(await loadSettings());
      setMeta((await loadPlayers()).meta);
      setNotes(await loadNotes());
      setLoaded(true);
    })();
  }, []);

  // Autosave: the draft tab picks changes up through chrome.storage.onChanged.
  useEffect(() => {
    if (!loaded) return;
    void saveSettings(settings);
  }, [settings, loaded]);

  const weightTotal = useMemo(
    () => Object.values(settings.weights).reduce((a, b) => a + b, 0),
    [settings.weights],
  );

  async function importText(text: string, source: string) {
    const result = parseProjections(text, source);
    if (result.players.length === 0) {
      setStatus({ kind: "bad", text: `匯入失敗：${result.errors[0] ?? "沒有有效資料"}` });
      return;
    }
    const saved = await savePlayers(result.players, source);
    setMeta(saved);
    setStatus({
      kind: result.skipped > 0 ? "warn" : "ok",
      text: `匯入 ${saved.count} 位球員（${saved.withProjection} 有 projection）${
        result.skipped ? `，略過 ${result.skipped} 筆：${result.errors[0]}` : ""
      }`,
    });
  }

  return (
    <div className="wrap">
      <h1>Fantasy Draft AI Copilot</h1>
      <p className="lede">
        只讀 Yahoo Draft Room，推薦引擎在本機執行。設定會自動儲存，草稿分頁不需重新整理。
      </p>

      <section className="card">
        <h2>聯盟設定</h2>
        <div className="grid">
          <div>
            <label htmlFor="teams">隊伍數</label>
            <input
              id="teams"
              type="number"
              min={4}
              max={20}
              value={settings.league.teams}
              onChange={(e) => setSettings({ ...settings, league: { ...settings.league, teams: Number(e.target.value) } })}
            />
          </div>
          <div>
            <label htmlFor="draftType">選秀類型</label>
            <select
              id="draftType"
              value={settings.league.draftType}
              onChange={(e) =>
                setSettings({ ...settings, league: { ...settings.league, draftType: e.target.value as "snake" | "linear" } })
              }
            >
              <option value="snake">Snake</option>
              <option value="linear">Linear</option>
            </select>
          </div>
          <div>
            <label htmlFor="scoring">計分</label>
            <select
              id="scoring"
              value={settings.league.scoring}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  league: { ...settings.league, scoring: e.target.value as AppSettings["league"]["scoring"] },
                })
              }
            >
              <option value="9cat">9-CAT H2H</option>
              <option value="8cat">8-CAT（無 TO）</option>
              <option value="roto">Roto</option>
              <option value="points">Points</option>
            </select>
          </div>
          <div>
            <label htmlFor="slot">我的 draft slot</label>
            <input
              id="slot"
              type="number"
              min={1}
              max={settings.league.teams}
              value={settings.myDraftSlot ?? ""}
              placeholder="自動偵測"
              onChange={(e) =>
                setSettings({ ...settings, myDraftSlot: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </div>
          <div>
            <label htmlFor="timer">每手秒數</label>
            <input
              id="timer"
              type="number"
              min={10}
              max={300}
              value={settings.league.secondsPerPick ?? 60}
              onChange={(e) =>
                setSettings({ ...settings, league: { ...settings.league, secondsPerPick: Number(e.target.value) } })
              }
            />
          </div>
          <div>
            <label htmlFor="quick">Quick Mode 門檻（剩幾手）</label>
            <input
              id="quick"
              type="number"
              min={0}
              max={10}
              value={settings.quickModeThreshold}
              onChange={(e) => setSettings({ ...settings, quickModeThreshold: Number(e.target.value) })}
            />
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <label htmlFor="availability">
            出場數權重：{settings.availabilityWeight.toFixed(2)}（
            {settings.availabilityWeight <= 0.15
              ? "幾乎只看每場產量"
              : settings.availabilityWeight >= 0.85
                ? "幾乎完全看整季總產量"
                : "平衡"}
            ）
          </label>
          <input
            id="availability"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.availabilityWeight}
            onChange={(e) => setSettings({ ...settings, availabilityWeight: Number(e.target.value) })}
          />
          <p className="hint">
            0 = 只看每場數據，完全不管他打幾場；1 = 按預計出場數線性折算（Roto 適用）。
            預設 0.5：預計打 45 場的球員保留約八成價值。H2H 可以撿 waiver 補洞，
            所以缺賽的代價通常不是線性的。
          </p>
        </div>

        <h2 style={{ marginTop: 18 }}>計分 category</h2>
        <div className="row">
          {CATEGORIES.map((category) => (
            <label key={category} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={settings.league.categories.includes(category)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    league: {
                      ...settings.league,
                      categories: e.target.checked
                        ? [...settings.league.categories, category]
                        : settings.league.categories.filter((c) => c !== category),
                    },
                  })
                }
              />
              {category}
            </label>
          ))}
        </div>

        <h2 style={{ marginTop: 18 }}>Roster slots</h2>
        <div className="grid">
          {SLOTS.map((slot) => (
            <div key={slot}>
              <label htmlFor={`slot-${slot}`}>{slot}</label>
              <input
                id={`slot-${slot}`}
                type="number"
                min={0}
                max={10}
                value={settings.league.rosterSlots[slot] ?? 0}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    league: {
                      ...settings.league,
                      rosterSlots: { ...settings.league.rosterSlots, [slot]: Number(e.target.value) },
                    },
                  })
                }
              />
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>球員 projections</h2>
        <div className="row">
          <input
            type="file"
            accept=".csv,.json,text/csv,application/json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              await importText(await file.text(), file.name);
            }}
          />
          <button
            type="button"
            className="ghost"
            onClick={async () => {
              const demo = buildDemoPool();
              setMeta(await savePlayers(demo, "demo pool (fictional)"));
              setStatus({ kind: "warn", text: "已載入示範球員池（虛構資料，僅供測試 mock draft）" });
            }}
          >
            載入示範球員池
          </button>
        </div>
        <p className="hint">
          需要欄位：<code>name, team, positions, gp, fg_pct, ft_pct, three_pm, pts, reb, ast, stl, blk, tov</code>；
          建議附上 <code>fga, fta, adp</code>（百分比項目需要出手數才能正確加權）。
        </p>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder="或直接貼上 CSV / JSON…"
        />
        <div className="row" style={{ marginTop: 8 }}>
          <button type="button" disabled={!pasted.trim()} onClick={() => void importText(pasted, "pasted.csv")}>
            匯入貼上的資料
          </button>
          <div className="spacer" />
          {meta && (
            <span className="hint">
              目前：{meta.count} 位球員 · {meta.withProjection} 有 projection · 來源 {meta.source} ·{" "}
              {new Date(meta.importedAt).toLocaleString()}
            </span>
          )}
        </div>
        {status && (
          <div className={`status ${status.kind}`} style={{ marginTop: 10 }}>
            {status.text}
          </div>
        )}
      </section>

      <section className="card">
        <h2>建隊策略 / Punt</h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <label style={{ margin: 0 }}>模式</label>
          <select
            value={settings.strategyMode}
            style={{ width: 180 }}
            onChange={(e) => setSettings({ ...settings, strategyMode: e.target.value as AppSettings["strategyMode"] })}
          >
            <option value="suggest">只建議（推薦）</option>
            <option value="auto">自動套用</option>
            <option value="manual">手動鎖定</option>
          </select>
        </div>
        <div className="punt-grid">
          {CATEGORIES.map((category) => (
            <div className="punt" key={category}>
              <strong>{category}</strong>
              <select
                value={settings.manualPunts[category]}
                disabled={settings.strategyMode !== "manual"}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    manualPunts: { ...settings.manualPunts, [category]: e.target.value as PuntLevel },
                  })
                }
                aria-label={`${category} punt level`}
              >
                <option value="none">none</option>
                <option value="soft">soft</option>
                <option value="hard">hard</option>
              </select>
            </div>
          ))}
        </div>
        <p className="hint">
          <b>只建議</b>：偵測並顯示建隊方向，但分數照常計算，不放棄任何 category。
          模擬 144 場選秀的結果，自動套用 punt 平均每週少贏約 0.1 類，所以預設不套用。
          你有明確的 punt 計畫時再切到「手動鎖定」。
          自動偵測在第 1–2 輪不會判定 punt；第 3 輪起才可能 soft，第 5 輪起才可能 hard。
        </p>
      </section>

      <section className="card">
        <h2>推薦權重</h2>
        {(Object.keys(WEIGHT_LABELS) as (keyof EngineWeights)[]).map((key) => (
          <div className="weight-row" key={key}>
            <span>{WEIGHT_LABELS[key]}</span>
            <input
              type="range"
              min={0}
              max={0.6}
              step={0.01}
              value={settings.weights[key]}
              onChange={(e) => setSettings({ ...settings, weights: { ...settings.weights, [key]: Number(e.target.value) } })}
              aria-label={WEIGHT_LABELS[key]}
            />
            <span>{settings.weights[key].toFixed(2)}</span>
          </div>
        ))}
        <div className="row" style={{ marginTop: 10 }}>
          <span className="hint">總和 {weightTotal.toFixed(2)}（不需要等於 1，相對大小才重要）</span>
          <div className="spacer" />
          <button type="button" className="ghost" onClick={() => setSettings({ ...settings, weights: DEFAULT_SETTINGS.weights })}>
            還原預設權重
          </button>
        </div>
      </section>

      <section className="card">
        <h2>AI 解釋（選用）</h2>
        <div className="grid">
          <div>
            <label htmlFor="provider">Provider</label>
            <select
              id="provider"
              value={settings.llm.provider}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  llm: { ...settings.llm, provider: e.target.value as "openai" | "none", enabled: e.target.value !== "none" },
                })
              }
            >
              <option value="none">關閉</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>
          <div>
            <label htmlFor="model">Model</label>
            <input
              id="model"
              type="text"
              value={settings.llm.model}
              onChange={(e) => setSettings({ ...settings, llm: { ...settings.llm, model: e.target.value } })}
            />
          </div>
          <div>
            <label htmlFor="timeout">Timeout (ms)</label>
            <input
              id="timeout"
              type="number"
              min={500}
              max={10000}
              value={settings.llm.timeoutMs}
              onChange={(e) => setSettings({ ...settings, llm: { ...settings.llm, timeoutMs: Number(e.target.value) } })}
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="key">API key（存在本機 chrome.storage.local）</label>
            <input
              id="key"
              type="password"
              value={settings.llm.apiKey ?? ""}
              placeholder="sk-…"
              onChange={(e) => setSettings({ ...settings, llm: { ...settings.llm, apiKey: e.target.value } })}
            />
          </div>
        </div>
        <p className="hint">
          只會送出正規化的籃球資料（聯盟規模、輪次、候選人與 category 影響）。不會送出 Yahoo cookie、session token
          或頁面 HTML。AI 逾時或失敗時，推薦仍正常運作。
        </p>
      </section>

      <section className="card">
        <h2>我的球員判斷</h2>
        {Object.keys(notes).length === 0 ? (
          <p className="hint">
            還沒有任何標記。在選秀面板點開候選人 → 最下面的「我的判斷」可以標記
            <code>鎖定目標 / 看好 / 看衰 / 風險</code>，標記會跨場次保留。
          </p>
        ) : (
          <>
            <div className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
              {Object.values(notes)
                .sort((a, b) => b.adjustment - a.adjustment)
                .map((note) => (
                  <div className="row" key={note.playerId} style={{ gap: 8 }}>
                    <span style={{ minWidth: 160 }}>{note.name}</span>
                    <span className="hint" style={{ minWidth: 90 }}>
                      {note.adjustment > 0 ? "★ 看好" : "☆ 看衰"} {(note.adjustment * 100).toFixed(0)}
                      {note.risk ? " · 風險" : ""}
                    </span>
                    <div className="spacer" />
                    <button
                      type="button"
                      className="ghost"
                      onClick={async () => {
                        const next = { ...notes };
                        delete next[note.playerId];
                        setNotes(next);
                        await saveNotes(next);
                      }}
                    >
                      移除
                    </button>
                  </div>
                ))}
            </div>
            <p className="hint">
              標記是「有界的推力」不是覆寫：它能讓球員往前幾個名次或決定接近的取捨，
              但不會蓋掉真正的價值差距。
            </p>
          </>
        )}
      </section>

      <section className="card">
        <h2>開發者</h2>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={settings.devInspector}
            onChange={(e) => setSettings({ ...settings, devInspector: e.target.checked })}
          />
          啟用 DOM Inspector 與詳細 log
        </label>
        <p className="hint">
          開啟後，overlay 右上角的 🔍 會匯出去識別化的 selector 報告，用來在真實 Draft Room 校正{" "}
          <code>src/content/yahoo/selectors.ts</code>。
        </p>
        <div className="row" style={{ marginTop: 10 }}>
          <button type="button" className="ghost" onClick={() => setSettings(DEFAULT_SETTINGS)}>
            還原所有設定
          </button>
        </div>
      </section>
    </div>
  );
}
