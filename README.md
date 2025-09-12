# Logs Visualization

## Objective(目的)
將Procmon錄製下來的Raw event logs進行**視覺化**，並透過適當的擴充讓瀏覽、標記Raw events更為便利。

## Features(功能)
- **Graphify**: 以Process -> Operation -> Target Path 為一基準單位，將Procmon的Raw event logs轉換成Node-Edge之Graph結構
- **Text Supplementation**: 以Graph結構為基礎，將Event其餘欄位在選取Node/Edge時顯示在旁邊，並可以選擇開啟Parser將冗長的敘述模板化
- **Filtering**: 提供多種欄位的篩選功能，並可以同時篩選多個欄位 E.g. 只顯示特定時間段、特定Process的Event
- **Pattern Highlighting**: 透過Predefined/ Self defined 的方式，將Graph中符合Pattern的Node/Edge標示出來
- **Annotation**: 允許在Graph中對Node/Edge進行標記，並可以將標記結果匯出成CSV檔案 
- **Interactive Navigation**: 提供Graph的縮放、拖曳等功能，並可以透過搜尋特定Node/Edge來快速定位