# LogViz - 日誌視覺化工具

一個幫助您快速理解和分析電腦行為記錄的視覺化工具。將複雜的系統日誌轉換成互動式的圖形,讓您能夠輕鬆找出可疑活動。

---

## 📖 這個工具能做什麼?

LogViz 能將電腦系統的操作記錄(Process Monitor 日誌)轉換成視覺化的網路圖。圖形中的**圓點**代表不同的物件(程式、檔案、登錄、網路連線),**箭頭**表示它們之間的操作關係。

### 主要功能

✨ **互動式圖形**
- 用滑鼠拖曳、縮放來查看整個關係網路
- 點擊圓點或箭頭可看到詳細資訊
- 不同顏色代表不同類型的物件(綠色=程式、紫色=檔案、藍色=登錄、黃色=網路)

🔍 **強大的搜尋功能**
- 快速找出特定操作(例如:檔案寫入、登錄讀取)
- 搜尋特定程式或檔案路徑
- 搜尋結果會自動展開完整的相關路徑

📊 **即時統計資訊**
- 顯示當前有多少圓點(節點)和箭頭(關聯)
- 顯示時間範圍和日誌筆數
- 幫助您掌握資料的整體狀況

🎯 **聰明的篩選**
- 只看您關心的資料:可選擇顯示特定類型的物件
- 調整時間範圍:只看特定時段的活動
- 簡化檢視:合併重複的操作以減少混亂

---

## 🚀 如何開始使用

### 第一步:準備環境

1. **確認電腦已安裝 Python**
   - 需要 Python 3.8 或更新版本
   - 打開命令提示字元(cmd)或 PowerShell
   - 輸入 `python --version` 確認版本

2. **安裝必要套件**
   ```bash
   pip install -r requirements.txt
   ```
   這會自動安裝所有需要的 Python 套件

### 第二步:準備資料

將您的 Process Monitor CSV 日誌檔案轉換成視覺化格式:

```bash
python unified_viz_data_preparation.py
```

這個步驟會:
- 讀取您的日誌檔案
- 建立圖形關係
- 產生網頁可以讀取的資料格式

### 第三步:啟動工具

```bash
python unified_viz_server.py
```

預設會在 8000 埠啟動,如果想用其他埠號:
```bash
python unified_viz_server.py --port 9000
```

### 第四步:開始使用

1. 打開瀏覽器(建議使用 Chrome、Firefox 或 Edge)
2. 前往 `http://localhost:8000`
3. 開始探索您的資料!

---

## 📋 基本操作說明
# LogViz – Procmon 事件互動圖形視覺化 (Procmon Event Graph Visualization)

精簡、快速、可探索。LogViz 將 Process Monitor 原始事件轉成「程序 ↔ 檔案 / 登錄 / 網路」互動圖,幫助你用關係結構而不是長表格來理解行為,鎖定可疑活動與攻擊序列。

---

## 🔑 核心價值 (Value Proposition)
- 事件 → 關係圖: 一筆事件 = 一條有向邊,節點語意清晰。
- 時序/視窗導覽: Entry 範圍與滑動視窗快速重播行為。
- 進階搜尋語法: `op: / process: / pid: / type:` 與關鍵字組合,自動展開完整因果鏈。
- 攻擊序列偵測: Sequence pattern + 信心分數標註連續操作行為。
- REAPr-inspired Registry/行為分析: 標記 root cause / malicious / contaminated 路徑。
- 高互動性: 節點拖曳、縮放、合併邊、顯示/隱藏類型、快速聚焦。

---

## 🚀 快速開始 (Quick Start)
```bash
pip install -r requirements.txt          # 安裝依賴 / install deps
python unified_viz_data_preparation.py   # 轉換並產生圖資料 JSON
python unified_viz_server.py --port 8000 # 啟動伺服器 (預設 8000)
```
開瀏覽器 → http://localhost:8000 → 選取資料集 → Load Graph → 探索。

資料尚未生成? 先執行資料準備腳本; 只要 `unified_viz_data/*.json` 存在即可直接載入。

---

## ✨ 主要功能 (Features)
- 互動式 vis-network 圖形 (拖曳 / 縮放 / 重新定位)。
- 四類節點: Process / File / Registry / Network (色彩區分)。
- Entry 範圍 & 滑動視窗 (時間/序列瀏覽)。
- Combine Edges 合併相同操作,降噪提升可讀性。
- 進階搜尋 + 高亮或篩選模式 (Highlight / Filter)。
- Sequence Patterns: 偵測常見行為鏈 (Process Create, File Write, Registry 修改, TCP 交換)。
- REAPr 風格攻擊路徑標註 (root cause / malicious / contaminated / impact)。
- 統計面板: 節點數 / 邊數 / 時間範圍 / 可用特徵。

---

## 🔍 搜尋語法 (Search Syntax)
| 類型 | 語法 | 範例 |
| ---- | ---- | ---- |
| 操作 | `op:<Operation>` | `op:RegRead`, `op:CreateFile` |
| 程序 | `process:<name>` / `pid:<id>` | `process:powershell`, `pid:3420` |
| 類型 | `type:<process|file|registry|network>` | `type:registry` |
| 關鍵字 | 任意字串模糊比對 | `HKLM\Software`, `System32` |
| 組合 | 多條件並列 | `process:powershell op:CreateFile type:file` |

模式: Highlight (顯示全部並標亮) / Filter (僅顯示符合)。結果上限 200 筆避免負載。Esc 清除, Enter 執行。

---

## 🧪 攻擊序列 (Sequence Detection)
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

## 📦 資料準備 (Data Preparation)
輸入: 已轉成 pickle + metadata JSON 的圖 (`Graphs/*.pkl` + `*_edge_metadata.json`)
腳本: `unified_viz_data_preparation.py`
輸出: `unified_viz_data/<graph_id>.json` + `metadata_index.json`
節點/邊結構: 
- nodes: id, label, type, pid
- edges: src, dst, operation, timestamp, entry_index, metadata (technique 等)

---

## ⚙️ 組態 (Config Hints)
調整 `js/` 下 config / 模組: 顯示顏色、API base、物理引擎、搜尋模式。
自訂樣式: `css/`；Pattern 擴充: `graphutil.py`。

---

## 🧭 使用流程 (Suggested Flow)
1. 產生 JSON → 啟動伺服器。
2. 先載入前 100~200 entries 觀察結構。
3. 用搜尋聚焦 (例如 `op:RegSetValue Run` / `process:powershell`).
4. 開啟 Sequence / REAPr 選項鎖定行為鏈。
5. 滑動視窗重播行為,確認時間序列。

---

## 🩺 疑難排解 (Troubleshooting)
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

## 🤝 貢獻 (Contributing)
歡迎提出 Issue / PR: 可聚焦於
- 更精準的 sequence patterns
- 效能 (虛擬化 / 邊抽樣 / WebGL)
- REAPr 標註擴充 (加權信心)
- 搜尋語法擴充 (邏輯運算符, 時間範圍)

---

## 📜 授權 (License)
MIT (若未附上授權, 建議新增 LICENSE 檔案)。

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

若需完整詳細原始長版文件,請參考歷史版本或建立 `DOCS/` 補充。

Enjoy hunting. 🔍