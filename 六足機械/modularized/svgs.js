/**
 * svgs.js - 🤖 機器人向量圖形加載器
 * 使用 Vite 的 ?raw 功能，將 SVG/HTML 內容直接打包進腳本中，
 * 避免在 Vercel 部署時出現 404 錯誤。
 */

import legText from '../SVG/robot/腳.html?raw';
import rodText from '../SVG/robot/直杆.html?raw';
import gearboxText from '../SVG/robot/齒輪箱.html?raw';
import crankText from '../SVG/robot/曲柄.html?raw';
import motorText from '../SVG/robot/馬達.html?raw';

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
const legSVGPath = extractAllToPath2D(legText);
const rodSVGPath = extractAllToPath2D(rodText);
const gearboxSVGPath = extractAllToPath2D(gearboxText);
const crankSVGPath = extractAllToPath2D(crankText);
const motorSVGPath = extractAllToPath2D(motorText);

// 將變數掛載到 window，供 simulation.js 等非模組化腳本存取
window.legSVGPath = legSVGPath;
window.rodSVGPath = rodSVGPath;
window.gearboxSVGPath = gearboxSVGPath;
window.crankSVGPath = crankSVGPath;
window.motorSVGPath = motorSVGPath;

console.log("[SVGs] 機器人向量圖形載入完成 (Vite Raw Mode)");
