# LogViz – Procmon 事件互動圖形視覺化 (Procmon Event Graph Visualization)

精簡、快速、可探索。LogViz 將 Process Monitor 原始事件轉成「程序 ↔ 檔案 / 登錄 / 網路」互動圖,幫助你用關係結構而不是長表格來理解行為,鎖定可疑活動與攻擊序列。

---

##  核心價值 (Value Proposition)
- 事件 → 關係圖: 一筆事件 = 一條有向邊,節點語意清晰。
- 時序/視窗導覽: Entry 範圍與滑動視窗快速重播行為。
- 進階搜尋語法: `op: / process: / pid: / type:` 與關鍵字組合,自動展開完整因果鏈。
- 攻擊序列偵測: Sequence pattern + 信心分數標註連續操作行為。
- REAPr-inspired Registry/行為分析: 標記 root cause / malicious / contaminated 路徑。
- 高互動性: 節點拖曳、縮放、合併邊、顯示/隱藏類型、快速聚焦。

---

##  快速開始 (Quick Start)
```bash
pip install -r requirements.txt          # 安裝依賴 / install deps
python unified_viz_data_preparation.py   # 轉換並產生圖資料 JSON
python unified_viz_server.py --port 8000 # 啟動伺服器 (預設 8000)
```
開瀏覽器 → http://localhost:8000 → 選取資料集 → Load Graph → 探索。

資料尚未生成? 先執行資料準備腳本; 只要 `unified_viz_data/*.json` 存在即可直接載入。

---

##  主要功能 (Features)
- 互動式 vis-network 圖形 (拖曳 / 縮放 / 重新定位)。
- 四類節點: Process / File / Registry / Network (色彩區分)。
- Entry 範圍 & 滑動視窗 (時間/序列瀏覽)。
- Combine Edges 合併相同操作,降噪提升可讀性。
- 進階搜尋 + 高亮或篩選模式 (Highlight / Filter)。
- Sequence Patterns: 偵測常見行為鏈 (Process Create, File Write, Registry 修改, TCP 交換)。
- REAPr 風格攻擊路徑標註 (root cause / malicious / contaminated / impact)。
- 統計面板: 節點數 / 邊數 / 時間範圍 / 可用特徵。

---

##  搜尋語法 (Search Syntax)
| 類型 | 語法 | 範例 |
| ---- | ---- | ---- |
| 操作 | `op:<Operation>` | `op:RegRead`, `op:CreateFile` |
| 程序 | `process:<name>` / `pid:<id>` | `process:powershell`, `pid:3420` |
| 類型 | `type:<process|file|registry|network>` | `type:registry` |
| 關鍵字 | 任意字串模糊比對 | `HKLM\Software`, `System32` |
| 組合 | 多條件並列 | `process:powershell op:CreateFile type:file` |

模式: Highlight (顯示全部並標亮) / Filter (僅顯示符合)。結果上限 200 筆避免負載。Esc 清除, Enter 執行。

---

##  攻擊序列 (Sequence Detection)
內建 `SequencePattern` 定義 (於 `graphutil.py`):
- Process_Creation
- File_Creation_Write / File_Creation_Metadata_Write
- Registry_Creation_Modification / Registry_Modification
- TCP_Communication

每組比對提供: pattern 名稱, matched operations, confidence (依覆蓋率與順序)。
可自行新增:
```python
SequencePattern(
  name="Custom_Pattern",
  operations=["Op1","Op2"],
  color="#FF0000",
  description="My pattern",
  min_length=2,
  strict_order=True,
  results=["SUCCESS","SUCCESS"]
)
```

---

## 🛠 REAPr 風格標註 (REAPr-style Tagging)
若提供 Caldera / REAPr 預測檔 (line_id + 分類) 會標記:
- ROOT_CAUSE: 起始惡意程序
- MALICIOUS / IMPACT: 關鍵影響節點
- CONTAMINATED: 傳染路徑節點
攻擊路徑 = forward contam ∩ backward trace。

---

##  資料準備 (Data Preparation)
輸入: 已轉成 pickle + metadata JSON 的圖 (`Graphs/*.pkl` + `*_edge_metadata.json`)
腳本: `unified_viz_data_preparation.py`
輸出: `unified_viz_data/<graph_id>.json` + `metadata_index.json`
節點/邊結構: 
- nodes: id, label, type, pid
- edges: src, dst, operation, timestamp, entry_index, metadata (technique 等)

---

##  組態 (Config Hints)
調整 `js/` 下 config / 模組: 顯示顏色、API base、物理引擎、搜尋模式。
自訂樣式: `css/`；Pattern 擴充: `graphutil.py`。

---

##  使用流程 (Suggested Flow)
1. 產生 JSON → 啟動伺服器。
2. 先載入前 100~200 entries 觀察結構。
3. 用搜尋聚焦 (例如 `op:RegSetValue Run` / `process:powershell`).
4. 開啟 Sequence / REAPr 選項鎖定行為鏈。
5. 滑動視窗重播行為,確認時間序列。

---

##  疑難排解 (Troubleshooting)
| 問題 | 解決 |
| ---- | ---- |
| Graph 很慢 | 降低 entries, 關閉 Physics, 勾選 Combine Edges |
| 搜不到資料 | 清除搜尋 / 放大 Entry 範圍 / 確認類型未被隱藏 |
| 資料未載入 | 確認 `unified_viz_data/*.json` 是否存在, 重新執行準備腳本 |
| 顏色/樣式不符 | 檢查 `css/` 與 JS 模組快取 (硬重新整理) |

---

## 🏗 架構 (Architecture Snapshot)
Backend: `unified_viz_server.py` (靜態 + JSON) / `unified_viz_data_preparation.py` (轉換) / `graphutil.py` (patterns + 分析)
Frontend: `index.html` + `js/` 模組 (載入 / 搜尋 / 過濾 / 畫圖) + vis-network

---


## ✅ 摘要 (At a Glance)
| 類別 | 內容 |
| ---- | ---- |
| 目的 | Procmon 原始事件 → 互動圖形關係分析 |
| 支援節點 | Process / File / Registry / Network |
| 進階 | Sequence Patterns, REAPr-style 標註 |
| 搜尋 | `op:` `process:` `pid:` `type:` + 關鍵字組合 |
| 效能建議 | 先載入 100~200 entries; Combine Edges; 關閉 Physics |
| 可擴充 | 自訂 pattern / 樣式 / 搜尋語法 |

---
