/**
 * svgs.js - 🤖 機器人向量圖形加載器
 * 直接在腳本中硬編碼 SVG/HTML 內容，以兼容 Live Server 與 Vite 各種部署環境，
 * 避免因瀏覽器直接加載 ?raw 路徑而出現 MIME 類型錯誤。
 */

// 1. 腳的 SVG 內容 (原本為 腳.html)
const legText = `
<svg viewBox="0 0 60 115" xmlns="http://www.w3.org/2000/svg">
    <path d="
        M 21, 20
        A 9,9 0 0, 1 39, 20
        L 39, 75.67
        A 15.5,15.5 0 0, 0 54.5, 91.17
        A 25, 13 0 1, 1 5.39, 91.17
        A 15.5,15.5 0 0, 0 21, 75.67
        Z" fill="none" stroke="#ff9800" stroke-width="0.2" stroke-linejoin="round" />
    <circle cx="30" cy="20" r="1.5" fill="none" stroke="#ff9800" stroke-width="0.2" />
    <circle cx="30" cy="65" r="1.5" fill="none" stroke="#ff9800" stroke-width="0.2" />
</svg>
`;

// 2. 直杆的 SVG 內容 (原本為 直杆.html)
const rodText = `
<svg viewBox="0 0 20 112" xmlns="http://www.w3.org/2000/svg">
    <path d="
        M 5, 10
        A 5,5 0 0, 1 15, 10
        L 15, 102
        A 5,5 0 0, 1 5, 102
        Z" 
        fill="none" 
        stroke="#ff9800" 
        stroke-width="0.2" 
        stroke-linejoin="round" />
    <circle cx="10" cy="10" r="1.5" fill="none" stroke="#ff9800" stroke-width="0.2" />
    <circle cx="10" cy="102" r="1.5" fill="none" stroke="#ff9800" stroke-width="0.2" />
</svg>
`;

// 3. 齒輪箱的 SVG 內容 (原本為 齒輪箱.html)
const gearboxText = `
<svg viewBox="-5 -5 70 35" width="700" height="350" xmlns="http://www.w3.org/2000/svg">
    <g id="main-body" fill="#8a8d91" stroke="#fdfbf7" stroke-width="0.35" stroke-linejoin="round">
        <path d="
            M 2,0
            L 33.5, 1.32
            L 52, 1.32
            L 52, 25
            L 1, 25
            A 1,1 0 0,1 0,24
            L 0, 2
            A 2,2 0 0,1 2,0
            Z
        " />
        <rect x="43.75" y="1.32" width="8.25" height="4.34" />
        <rect x="43.75" y="20.66" width="8.25" height="4.34" />
        <line x1="31.50" y1="1.24" x2="31.50" y2="25" />
        <line x1="33.50" y1="1.32" x2="33.50" y2="25" />
    </g>
    <g id="hole-left" stroke="#fdfbf7" stroke-width="0.35">
        <circle cx="11.50" cy="12.50" r="3.50" fill="#808082" />
        <circle cx="11.50" cy="12.50" r="1.50" fill="#000000" />
    </g>
    <g id="hole-right" stroke="#fdfbf7" stroke-width="0.35">
        <circle cx="25.00" cy="12.50" r="3.50" fill="#808082" />
        <circle cx="25.00" cy="12.50" r="1.50" fill="#000000" />
    </g>
    <g id="bottom-key" fill="#8a8d91" stroke="#fdfbf7" stroke-width="0.35">
        <rect x="16" y="24" width="5" height="1" />
        <line x1="18.50" y1="25" x2="18.50" y2="21.5" />
    </g>
</svg>
`;

// 4. 曲柄的 SVG 內容 (原本為 曲柄.html)
const crankText = `
<svg viewBox="0 0 17.4 37.4" xmlns="http://www.w3.org/2000/svg">
    <path d="
        M 5, 8.7
        A 3.7,3.7 0 0, 1 12.4, 8.7
        L 12.4, 28.7
        A 3.7,3.7 0 0, 1 5, 28.7
        Z" 
        fill="none" 
        stroke="#ff9800" 
        stroke-width="0.2" 
        stroke-linejoin="round" />
    <path d="
        M 8.7, 6.968
        L 7.2, 7.834
        L 7.2, 9.566
        L 8.7, 10.432
        L 10.2, 9.566
        L 10.2, 7.834
        Z" 
        fill="none" 
        stroke="#ff9800" 
        stroke-width="0.2" 
        stroke-linejoin="round" />
    <circle cx="8.7" cy="15.2" r="1.5" fill="none" stroke="#ff9800" stroke-width="0.2" />
    <circle cx="8.7" cy="19.7" r="1.5" fill="none" stroke="#ff9800" stroke-width="0.2" />
    <circle cx="8.7" cy="24.2" r="1.5" fill="none" stroke="#ff9800" stroke-width="0.2" />
    <circle cx="8.7" cy="28.7" r="1.5" fill="none" stroke="#ff9800" stroke-width="0.2" />
</svg>
`;

// 5. 馬達的 SVG 內容 (原本為 馬達.html)
const motorText = `
<svg viewBox="-2 -2 22 24" xmlns="http://www.w3.org/2000/svg">
    <path id="main_body" d="
        M 0,0 
        L 14.50,0 
        A 1,1 0 0,1 15.50,1.00 
        L 15.50,19.00 
        A 1,1 0 0,1 14.50,20.00 
        L 0,20.00 
        Z" />
    <path id="right_main_rect" fill="#f0f0f0" d="
        M 15.50, 5.00
        L 17.50, 5.00
        A 0.5,0.5 0 0,1 18.00, 5.50
        L 18.00, 14.50
        A 0.5,0.5 0 0,1 17.50, 15.00
        L 15.50, 15.00
        Z" />
    <path id="right_small_rect" fill="#DCDCDC" d="
        M 18.00, 9.00
        L 18.50, 9.00
        A 0.5,0.5 0 0,1 19.00, 9.50
        L 19.00, 10.50
        A 0.5,0.5 0 0,1 18.50, 11.00
        L 18.00, 11.00
        Z" />
    <path id="inner_cutout" fill="#7a7a7a" d="
        M 10.50, 6.25 
        L 10.50, 13.75 
        L 13.50, 13.75 
        L 13.50, 6.25 
        Z" />
    <g id="bronze-parts" fill="#cd7f32" stroke="#8b4513" stroke-width="0.1">
        <path id="bronze_top" d="
            M 11.50, 6.25 
            L 11.50, 3.25 
            A 1.00,1.00 0 0,1 13.50, 3.25 
            L 13.50, 6.25 
            Z" />
        <path id="bronze_top_hole" d="
            M 12.00, 5.25 
            L 12.00, 3.75 
            A 0.50,0.50 0 0,1 13.00, 3.75 
            L 13.00, 5.25 
            Z" fill="#ffffff" />
        <path id="bronze_bottom" d="
            M 11.50, 13.75 
            L 11.50, 16.75 
            A 1.00,1.00 0 0,0 13.50, 16.75 
            L 13.50, 13.75 
            Z" />
        <path id="bronze_bottom_hole" d="
            M 12.00, 14.75 
            L 12.00, 16.25 
            A 0.50,0.50 0 0,0 13.00, 16.25 
            L 13.00, 14.75 
            Z" fill="#ffffff" />
    </g>
    <line stroke="#333333" stroke-width="0.05" x1="10.50" y1="0.00" x2="10.50" y2="20.00" />
    <line stroke="#ffffff" stroke-width="0.05" x1="0.00" y1="4.00" x2="10.50" y2="4.00" opacity="0.5" />
    <line stroke="#ffffff" stroke-width="0.05" x1="0.00" y1="16.00" x2="10.50" y2="16.00" opacity="0.5" />
</svg>
`;

/**
 * 將 HTML/SVG 字串解析並轉換為 Canvas 可用的 Path2D 物件
 */
const extractAllToPath2D = (htmlStr) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlStr, "text/html");
    let dString = "";

    // 移除 defs 與 fill-only 元素
    doc.querySelectorAll('defs').forEach(d => d.remove());
    doc.querySelectorAll('.fill-only').forEach(f => f.remove());

    // 提取路徑資料
    doc.querySelectorAll('path').forEach(p => {
        dString += p.getAttribute('d') + " ";
    });

    // 處理矩形
    doc.querySelectorAll('rect').forEach(r => {
        let x = parseFloat(r.getAttribute('x') || 0);
        let y = parseFloat(r.getAttribute('y') || 0);
        let w = parseFloat(r.getAttribute('width') || 0);
        let h = parseFloat(r.getAttribute('height') || 0);
        dString += `M ${x},${y} h ${w} v ${h} h ${-w} Z `;
    });

    // 處理線條
    doc.querySelectorAll('line').forEach(l => {
        let x1 = parseFloat(l.getAttribute('x1') || 0);
        let y1 = parseFloat(l.getAttribute('y1') || 0);
        let x2 = parseFloat(l.getAttribute('x2') || 0);
        let y2 = parseFloat(l.getAttribute('y2') || 0);
        dString += `M ${x1},${y1} L ${x2},${y2} `;
    });

    // 處理圓形
    doc.querySelectorAll('circle').forEach(c => {
        let cx = parseFloat(c.getAttribute('cx') || 0);
        let cy = parseFloat(c.getAttribute('cy') || 0);
        let r = parseFloat(c.getAttribute('r') || 0);
        dString += `M ${cx - r},${cy} a ${r},${r} 0 1,0 ${2 * r},0 a ${r},${r} 0 1,0 ${-2 * r},0 `;
    });

    return new Path2D(dString.trim());
};

// 初始化所有路徑
export const legSVGPath = extractAllToPath2D(legText);
export const rodSVGPath = extractAllToPath2D(rodText);
export const gearboxSVGPath = extractAllToPath2D(gearboxText);
export const crankSVGPath = extractAllToPath2D(crankText);
export const motorSVGPath = extractAllToPath2D(motorText);

// 將變數掛載到 window，供非模組化場景使用
window.legSVGPath = legSVGPath;
window.rodSVGPath = rodSVGPath;
window.gearboxSVGPath = gearboxSVGPath;
window.crankSVGPath = crankSVGPath;
window.motorSVGPath = motorSVGPath;

console.log("[SVGs] 機器人向量圖形載入完成 (硬編碼內建模式)");
