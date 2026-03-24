// svgs.js
// 從外部檔案動態加載 SVG 結構，並儲為 Canvas 可用的 Path2D 物件

// 宣告預設為空的 Path2D，等待 fetch 完成後會被覆蓋
let legSVGPath = new Path2D();
let rodSVGPath = new Path2D();
let gearboxSVGPath = new Path2D();
let crankSVGPath = new Path2D();
let motorSVGPath = new Path2D();

async function loadExternalSVGs() {
    try {
        // 發出 HTTP 請求，取得上一層 SVG 資料夾中的原始檔案
        const [legRes, rodRes, gearboxRes, crankRes, motorRes] = await Promise.all([
            fetch('../SVG/腳.html'),
            fetch('../SVG/直杆.html'),
            fetch('../SVG/齒輪箱.html'),
            fetch('../SVG/曲柄.html'),
            fetch('../SVG/馬達.html')
        ]);

        if (!legRes.ok || !rodRes.ok || !gearboxRes.ok || !crankRes.ok || !motorRes.ok) throw new Error(`HTTP 請求狀態異常`);

        const legText = await legRes.text();
        const rodText = await rodRes.text();
        const gearboxText = await gearboxRes.text();
        const crankText = await crankRes.text();
        const motorText = await motorRes.text();

        // 使用瀏覽器內建的 DOMParser 解析 HTML/SVG 字串以萃取所有向量形狀
        const extractAllToPath2D = (htmlStr) => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlStr, "text/html");
            let dString = "";

            // 移除所有在 <defs> 中的內容，避免裁切路徑等被誤認為是圖形
            doc.querySelectorAll('defs').forEach(d => d.remove());
            // 移除帶有 .fill-only 類別的元素，這些通常只用於預覽而不應被繪製輪廓
            doc.querySelectorAll('.fill-only').forEach(f => f.remove());

            // 處理 <path>
            doc.querySelectorAll('path').forEach(p => {
                dString += p.getAttribute('d') + " ";
            });
            // 處理 <rect> 轉換為 SVG path
            doc.querySelectorAll('rect').forEach(r => {
                let x = parseFloat(r.getAttribute('x') || 0);
                let y = parseFloat(r.getAttribute('y') || 0);
                let w = parseFloat(r.getAttribute('width') || 0);
                let h = parseFloat(r.getAttribute('height') || 0);
                dString += `M ${x},${y} h ${w} v ${h} h ${-w} Z `;
            });
            // 處理 <line> 轉換為 SVG path (M x1,y1 L x2,y2)
            doc.querySelectorAll('line').forEach(l => {
                let x1 = parseFloat(l.getAttribute('x1') || 0);
                let y1 = parseFloat(l.getAttribute('y1') || 0);
                let x2 = parseFloat(l.getAttribute('x2') || 0);
                let y2 = parseFloat(l.getAttribute('y2') || 0);
                dString += `M ${x1},${y1} L ${x2},${y2} `;
            });
            // 處理 <circle> 轉換為 SVG path (雙圓弧)
            doc.querySelectorAll('circle').forEach(c => {
                let cx = parseFloat(c.getAttribute('cx') || 0);
                let cy = parseFloat(c.getAttribute('cy') || 0);
                let r = parseFloat(c.getAttribute('r') || 0);
                dString += `M ${cx - r},${cy} a ${r},${r} 0 1,0 ${2 * r},0 a ${r},${r} 0 1,0 ${-2 * r},0 `;
            });

            return new Path2D(dString.trim());
        };

        legSVGPath = extractAllToPath2D(legText);
        rodSVGPath = extractAllToPath2D(rodText);
        gearboxSVGPath = extractAllToPath2D(gearboxText);
        crankSVGPath = extractAllToPath2D(crankText);
        motorSVGPath = extractAllToPath2D(motorText);

        // 當非同步加載完成後，如果模擬器(simulation.js)已載入，主動觸發一次重繪來將圖形顯示在畫布上
        if (typeof triggerUpdate === 'function') {
            triggerUpdate();
        }
        console.log("外部 SVG 讀取成功！");
    } catch (error) {
        console.warn("無法取得外部 SVG。", error);
        console.warn("請注意：如果您未透過本機伺服器 (如 Live Server、Python http.server) 而是直接雙擊開啟 file://，瀏覽器的 CORS 政策會阻擋外部請求！請架設 Server 或發布至 Github Pages。");
    }
}

// 啟動加載程序
loadExternalSVGs();
