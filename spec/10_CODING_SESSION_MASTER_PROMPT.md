# 給編程 Session 的 Master Prompt

請直接依照本資料夾內所有文件實作「Fantasy Draft AI Copilot」。

## 目標

建立 macOS Chrome 可使用的 Chrome Extension，支援 Yahoo Fantasy Basketball 網頁 Draft Room。

第一版功能：
1. 讀取 Yahoo Draft Room 的 draft state
2. 即時追蹤 drafted players
3. 建立 user's roster
4. 計算 available player pool
5. 依 9-CAT projections 做推薦
6. 自動偵測 punt strategy
7. 在 Yahoo 畫面上顯示 overlay
8. 顯示 Best Pick + Top 5
9. 快輪到使用者時切 Quick Mode
10. LLM 只作 explanation，不可作唯一 ranking source

## 開發要求

- TypeScript
- React
- Chrome Manifest V3
- Vite
- Zustand
- Zod
- Vitest
- Playwright
- 模組化 Yahoo adapter
- 不可將 DOM selector 散落在 UI
- API key 不可 hardcode
- 不可把 Yahoo cookie/auth token 傳給第三方
- Yahoo DOM parser 若失效要 fail loudly
- deterministic recommendation engine 必須在 LLM 離線時仍可運作

## 非目標

第一版禁止：
- 自動登入
- 繞過 Yahoo 安全機制
- 完全自動 Draft
- 依賴 undocumented private API

## 開發方式

請依下列順序執行，不要只寫規劃：

1. 建立完整 project scaffold
2. 實作 types/schema
3. 實作 DraftPlatformAdapter
4. 實作 Yahoo adapter 與 DOM inspector
5. 實作 normalized DraftState
6. 實作 player import
7. 實作 recommendation engine
8. 實作 overlay
9. 實作 settings
10. 實作 tests
11. 提供 build instructions
12. 提供 Chrome Load unpacked instructions
13. 列出目前 Yahoo 真實 Draft Room 尚需校正的 selectors

## Definition of Done

輸出應為一個可 build 的 repo。

至少應可以：

```bash
npm install
npm run dev
npm run build
npm test
```

並產出：

```text
dist/
```

可由 Chrome：
Extensions -> Developer mode -> Load unpacked
載入。

即使 Yahoo Draft 真實 selector 尚未校正，也必須有：
- fixture mode
- mock draft mode
- DOM inspector
- parser interface
- 完整 recommendation engine

最後請提供：
- architecture summary
- 完成項目
- 尚未完成項目
- 如何進 Yahoo mock draft 校正 DOM selector
- 已知風險
