# 六足機器人模擬器 - 模組化架構說明

這個 `modularized` 資料夾是原本單一檔案 `六足機械模擬latest.html` 經過重構後的結果。將程式碼拆分為三個獨立的檔案，大幅提升了未來的可讀性與維護性。

以下是這三個核心檔案的關聯與職責說明：

## 1. `index.html` (骨架與介面)
**角色：** 應用的進入點與 UI 結構。
- 負責載入外部的樣式表 (`<link rel="stylesheet" href="style.css">`) 以及核心邏輯腳本 (`<script src="simulation.js"></script>`)。
- 定義了所有使用者能看到的介面元素，包含 Canvas 繪圖區塊 (`#simCanvas`) 以及下方的控制面板（各種按鈕與滑桿）。
- **完全不包含**任何 CSS 樣式定義或 JavaScript 邏輯運作。

## 2. `style.css` (外觀與排版)
**角色：** 視覺呈現。
## 3. `svgs.js` (資源動態載入器)
**角色：** 負責從外部原始檔案 `../SVG/leg.html` 與 `../SVG/直杆.html` 非同步讀取 (Fetch) SVG 的路徑。
- 透過瀏覽器的 `fetch` API，將字串拉回後，使用 `DOMParser` 解析出裡面的 `<path d="...">`，並賦值給全域的 `legSVGPath` 及 `rodSVGPath` 變數讓 Canvas 使用。
- **好處：** 未來所有更新藍圖產生的 SVG、就算只有微調曲線，只要覆蓋舊有的 SVG 檔案，模擬器在不修改一行程式碼的狀態下就能直接同步套用新造型！

## 4. `simulation.js` (大腦與引擎)
**角色：** 物理引擎、Canvas 渲染以及互動邏輯。
- **物理與幾何計算：** 處理所有機器人連桿的運動學公式（如曲柄旋轉、腳步觸地偵測、重心推移計算）。
- **SVG 繪圖渲染：** 直接讀取 `svgs.js` 提供的全域變數，並透過 `drawSVGLink` 函數每幀進行即時的縮放 (`scale`) 與旋轉 (`rotate`)。
- **事件監聽：** 透過 `document.getElementById` 綁定 `index.html` 中定義的控制項。例如當使用者拉動「腿長」滑桿時，會同步觸發重算內部幾何比例（強制維持 36:45 的 SVG 正確比例），並即時刷新 Canvas 畫面。

---

1. **[載入]** 使用者開啟 `index.html`。
2. **[套用外觀]** 瀏覽器讀取 `style.css` 將控制項美化。
3. **[載入資源]** 載入 `svgs.js` 提供繪圖所需之純靜態 SVG 幾何路徑。
4. **[啟動引擎]** `simulation.js` 被載入並初始化 Canvas 與綁定事件。
5. **[互動循環]** 使用者在 UI `index.html` 拉動速度滑桿 $\rightarrow$ `simulation.js` 的 EventListener 攔截並改變 `simSpeed` 變數 $\rightarrow$ `requestAnimationFrame` 持續更新 Canvas 的渲染。

---

## 拆分架構的缺點 (Trade-offs)

雖然模組化讓程式碼變得易讀、可維護且可重複使用，但它也帶來了幾個小缺點：

1. **開發環境限制 (CORS 機制)**：
   一旦我們開始使用 `fetch('../SVG/leg.html')` 動態讀取外部檔案，瀏覽器基於同源安全政策 (CORS)，如果網址列是 `file://` 開頭就會回報 `CORS request not http` 或者被封鎖，而導致 Canvas 畫不出來。
   👉 **解法：** 當你在本機測試時，請確保你有架設一個本機的小型伺服器 (例如 VS Code 的 Live Server，或是命令列執行 `python -m http.server`)，將網址改成 `http://localhost:...`。將程式碼 Push 到 GitHub Pages 上時，因為它是標準的 HTTP(S) Server，這個問題將不再存在。

2. **檔案依賴與路徑風險**：
   專案從一體成型變成四個檔案。若是傳送檔案給別人，或者在不同資料夾間移動，很容易發生漏複製 `style.css` 或 `svgs.js`，導致各種白畫面或全毀失效。

3. **初期的伺服器請求次數 (HTTP Requests)**：
   以前單一檔案只需一次請求。拆分成四個小實體檔案代表載入時網路請求增加了 (HTML, CSS, JSx2)。但在這種微型專案且放在 Github Pages 之下，可以完全忽略這個毫秒級別的影響。
