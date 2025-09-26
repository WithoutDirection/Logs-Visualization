# 統一化日誌視覺化工具
*Unified Log Entry Visualization Tool*

這是一套以瀏覽器為核心的互動式圖形分析平台，專為安全分析師與研究人員設計，用來探索龐大的安全事件日誌並提取攻擊脈絡。
*A browser-based interactive graph analytics platform tailored for security analysts and researchers. It visualizes massive security log datasets, highlights attack sequences, and offers real-time filtering controls.*

---

## 功能總覽 (Features)
- **互動式網路圖**：透過 vis.js 提供平滑、可拖曳縮放的節點／邊視覺化。  
   *Interactive vis.js network visualization with smooth drag-and-zoom interactions.*
- **多類型節點支援**：同時呈現程序、檔案、登錄、網路節點，並以色彩樣式加以區分。  
   *Supports process, file, registry, and network node types with dedicated styling.*
- **即時統計資訊**：節點數、邊數、時間範圍等指標即時更新。  
   *Live statistics for nodes, edges, and time ranges.*
- **進階分析**：支援攻擊序列偵測、REAPr 登錄分析與信心閾值設定。  
   *Advanced analytics including sequence detection, REAPr registry insights, and confidence thresholds.*
- **高效載入**：內建漸進式載入與自動性能調校，可妥善處理 500+ 節點的大型圖。  
   *Progressive loading and adaptive performance tuning for graphs with 500+ nodes.*
- **搜尋與快捷鍵**：提供節點／邊全文搜尋、鍵盤操作與無障礙導覽。  
   *Full-text search for nodes/edges, keyboard shortcuts, and accessibility support.*

---

## 技術堆疊 (Technology Stack)
- 前端：HTML5、CSS3、ES6+ JavaScript  
   *Frontend: HTML5, CSS3, ES6+ JavaScript*
- 視覺化：vis-network (vis.js)  
   *Visualization: vis-network (vis.js)*
- 後端：Python 3.x 簡易 HTTP 伺服器  
   *Backend: Python 3.x lightweight HTTP server*
- 資料處理：NetworkX、Pandas、NumPy  
   *Data processing: NetworkX, Pandas, NumPy*

---

## 前置需求 (Prerequisites)
- Python 3.8 以上版本  
   *Python 3.8 or later*
- 支援 ES6 的現代瀏覽器  
   *Modern browser with ES6 support*
- 已安裝 `requirements.txt` 列出的套件  
   *Install dependencies listed in `requirements.txt`*

---

## 快速開始 (Quick Start)
1. 安裝依賴套件  
    *Install dependencies*
    ```bash
    pip install -r requirements.txt
    ```
2. 轉換與整理資料  
    *Prepare visualization data*
    ```bash
    python unified_viz_data_preparation.py
    ```
3. 啟動本地伺服器  
    *Start local server*
    ```bash
    python unified_viz_server.py (--port 8000 ```Default: 8000```)
    ```
4. 開啟瀏覽器：前往 `http://localhost:8000`  
    *Open browser and visit `http://localhost:8000`*

---

## 使用指引 (Usage Guide)
### 載入圖形 (Loading Graphs)
1. 從下拉選單選擇資料集。  
2. 點擊「Load Graph」載入圖形。  
3. 利用「From/To Entry」調整分析範圍。  
*Select a dataset, click "Load Graph," and adjust entry range to focus the analysis.*

### 導覽與過濾 (Navigation & Filtering)
- 視窗導覽：使用「Last / Next」遍歷日誌視窗。  
- 節點類型：勾選顯示程序／檔案／登錄／網路節點。  
- 信心滑桿：設定序列偵測最低信心值。  
*Navigate log windows, toggle node types, and tune the confidence slider to refine the graph.*

### 搜尋 (Search)
- 在標頭的搜尋框輸入關鍵字，按 Enter 執行搜尋。  
- 節點以金色高亮、邊以紅橘色標示。  
- 按 Esc 清除搜尋結果。  
*Use the header search box, press Enter to search, and Esc to clear highlights.*

### 視覺化選項 (Visualization Options)
- 序列群組：啟用攻擊序列集合顯示。  
- REAPr 分析：顯示登錄事件深度資訊。  
- 物理引擎：切換節點自動排版。  
- 邊文字：顯示或隱藏操作名稱。  
- 合併邊：將相同來源／目的與操作的邊合併。  
*Toggle sequence grouping, REAPr analysis, physics engine, edge labels, or combine identical edges.*

### 鍵盤快捷鍵 (Keyboard Shortcuts)
- `Ctrl + F`：自動縮放至全圖。  
- `Space`：切換物理引擎。  
- `Escape`：關閉細節面板或清除搜尋。  
- `Ctrl + R`：重新繪製圖形。  
*Keyboard shortcuts for fit, physics toggle, closing panels, and redraw.*

---

## 組態調校 (Configuration)
- `CONFIG.visualization`：調整節點樣式、物理引擎參數與字體。  
- `CONFIG.nodeColors`：自訂節點色彩與大小。  
- `CONFIG.apiBaseUrl`：設定資料服務端點（預設 `./unified_viz_data`）。  
*Customize visualization options, node colors, and API base URLs via `js/config.js`.*

---

## 資料格式 (Data Format)
系統預期輸入為 CSV，常用欄位如下：  
*The tool expects CSV input with the following fields:*  
- `Process Name`（程序名稱）  
- `PID`（程序 ID）  
- `Operation`（操作類型）  
- `Path`（檔案／登錄／網路路徑）  
- `Result`（SUCCESS/FAILURE 等結果）  
- `Date & Time`（時間戳記）  
- `Event Class`、`User`、`Command Line` 等補充欄位。  

---

## 架構概覽 (Architecture)
### 前端模組 (Frontend Modules)
- `js/app.js`：應用程式進入點與事件協調。  
- `js/modules/visualization.js`：視覺化與互動控制。  
- `js/modules/graph-loader.js`：讀取與快取圖形資料。  
- `js/modules/filters.js`：篩選邏輯與邊／節點過濾。  
- `js/modules/search.js`：節點與邊搜尋索引。  
- `js/modules/notifications.js`：通知與狀態列管理。  
*Modularized JavaScript architecture keeps responsibilities well separated.*

### 後端元件 (Backend Components)
- `unified_viz_server.py`：提供靜態資源與 API 的 HTTP 伺服器。  
- `unified_viz_data_preparation.py`：將原始圖資料轉為前端使用的 JSON。  
- `graphutil.py`：圖形分析、序列偵測與 REAPr 工具集。  
*Python scripts handle data preparation and lightweight serving.*

---

## 分析功能 (Analysis Features)
- **攻擊序列偵測**：辨識程序建立、檔案操作、登錄異常與網路行為。  
- **REAPr 登錄檢視**：快速定位可能的持久化或組態異動。  
- **統計面板**：節點／邊數量、日誌筆數、時間範圍即時顯示。  
*Detect attack sequences, inspect registry activities, and review live metrics.*

---

## 自訂化 (Customization)
- 編輯 `css/styles.css` 調整配色、排版與響應式行為。  
- 修改 `graphutil.py` 內的 `SequencePattern` 新增或調整攻擊樣式。  
*Customize styles and extend attack pattern definitions as needed.*

範例：  
*Example:*  
```python
SequencePattern(
      name="Custom_Pattern",
      operations=["Operation1", "Operation2"],
      color="#FF0000",
      description="Custom attack pattern",
      min_length=2,
      strict_order=True,
      results=["SUCCESS", "SUCCESS"]
)
```

---

## 疑難排解 (Troubleshooting)
- **效能問題**：減少顯示的日誌範圍、關閉物理引擎或合併多餘邊。  
   *Reduce entry range, disable physics, or combine redundant edges to improve performance.*
- **資料讀取異常**：確認 CSV 格式正確、檔案權限與資料夾結構。  
   *Verify CSV format, file permissions, and directory structure.*
- **瀏覽器相容性**：建議使用 Chrome 70+、Firefox 65+、Safari 12+。  
   *Recommended browsers: Chrome 70+, Firefox 65+, Safari 12+.*
---