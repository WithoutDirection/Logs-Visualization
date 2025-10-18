# LogViz Django 專案結構與說明

## 專案目錄

```
LogViz/
├── __init__.py           # 標記為 Python 套件，通常為空
├── asgi.py               # ASGI 入口，支援非同步部署（如 WebSocket）
├── settings.py           # 專案設定檔，包含資料庫、App、靜態檔、REST/CORS 等
├── urls.py               # URL 路由設定，串接各 app 與 API 端點
├── views.py              # 前端主頁 View（TemplateView），可擴充 context
├── wsgi.py               # WSGI 入口，傳統同步部署（如 gunicorn, uwsgi）
└── __pycache__/          # Python 編譯暫存檔，已清除（不需納入版本控管）
```

此外，倉庫根目錄的重點結構如下（節錄）：

```
<repo-root>/
├── agent/               # App：代理/執行器相關（models/views/...）
├── datasets/            # App：資料集管理
├── graphs/              # App：圖資料與 API
├── search/              # App：查詢語法與搜尋 API
├── static/              # 前端靜態資源（js/css）
├── templates/           # Django 模板（如 index.html）
├── scripts/             # 實用工具腳本（新的位置）
│   ├── check_api.py         # 本機 API smoke test
│   └── check_database.py    # 資料庫連線/統計檢查
├── manage.py            # Django 管理指令入口
└── requirements.txt     # 相依套件清單
```

## 各檔案用途

- `__init__.py`：標記此目錄為 Python 套件，內容為空。
- `asgi.py`：ASGI 入口，讓 Django 可用於非同步伺服器（如 Daphne、Uvicorn），支援 WebSocket、長連線等。
- `settings.py`：專案所有設定，包含：
  - 安裝的 Django/第三方/自訂 app
  - 資料庫設定（預設 SQLite，可改 PostgreSQL/MySQL）
  - 靜態檔、媒體檔路徑
  - REST Framework、CORS、分頁、認證等 API 設定
  - DEBUG、SECRET_KEY、時區、語系
- `urls.py`：路由設定，將網址分派給各 app 的 views，包含：
  - 管理後台 `/admin/`
  - 前端主頁 `/`（IndexView）
  - API 端點 `/api/`（datasets, graphs, search, agent）
  - API 認證 `/api-auth/`
  - 開發模式下靜態/媒體檔案服務
- `views.py`：主頁 View，採用 Django TemplateView，支援 context 擴充，並加上 never_cache 裝飾器避免快取。
- `wsgi.py`：WSGI 入口，傳統同步伺服器（如 gunicorn, uwsgi）用於生產環境。

### scripts/（工具腳本）
- `scripts/check_api.py`：對主要 API 端點進行 smoke test，便於本機驗證。
- `scripts/check_database.py`：檢查資料庫連線並列出資料表/物件統計。

執行範例（Windows PowerShell）：

```
python scripts/check_api.py
python scripts/check_database.py
```

## 專案組織與橫向開發建議

- 本目錄為 Django 專案主控層，負責全域設定、路由、入口。
- 各功能 app（如 datasets, graphs, search, agent）應獨立於主控層，放在同級目錄下（如 `LogViz/datasets/`），便於橫向擴充。
- 前端模板（如 index.html）放在 `templates/` 目錄，靜態檔（js/css）放在 `static/`，路徑於 settings.py 設定。
- API 端點採 REST Framework，支援分頁、搜尋、過濾，方便前端串接。
- 若需新增 app，建議：
  1. 使用 `python manage.py startapp <appname>` 建立新 app
  2. 在 settings.py 的 INSTALLED_APPS 加入新 app
  3. 在 urls.py 設定路由
  4. 在新 app 內撰寫 models/views/serializers/tests

### 測試與檔案清理（近期調整）
- 已移除各 app 內僅含「Create your tests here.」的空白樣板測試檔（`agent/tests.py`、`datasets/tests.py`、`graphs/tests.py`、`search/tests.py`）。
- 將根目錄的臨時測試腳本改為標準化工具腳本並移至 `scripts/`：
  - `test_api.py` → `scripts/check_api.py`
  - `test_database.py` → `scripts/check_database.py`
- 已移除根目錄的前端 API 測試頁 `test_api_frontend.html` 以保持根目錄整潔。

建議未來若要加入正式測試：
- 使用 pytest 或 Django TestCase，將測試放在各 app 的 `tests/` 目錄中，並覆蓋關鍵路由、序列化與查詢行為。
- 將範例或手動檢查性質的腳本集中於 `scripts/` 或 `tools/`，避免散落於根目錄。

## 適合的橫向開發方向
- 新增 API 功能（如 event log、user profile、分析模組）
- 擴充前端模板與靜態檔
- 整合第三方服務（如 Celery、Redis、ElasticSearch）
- 強化認證、權限、日誌、快取等

---

