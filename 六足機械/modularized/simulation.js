/**
 * Hexapod Simulator - Kinematics and Physics Logic
 */
import { rodSVGPath, gearboxSVGPath, crankSVGPath, motorSVGPath } from './svgs.js';
import { BGScroller } from './bg_scroll.js';

let legSVGPath = null; // 動態更新的腳部路徑
// --- Speed Visualization Configuration ---
const speedVizConfig = {
    particleCount: 60,
    particleBaseOpacity: 0.5,
    particleSpeedMult: 1.5,      // 1.5 to have a good speed visualization
    particleLengthScale: 0.15,
    echoCount: 3,                // Tiny amount of ghosts for blur feel
    echoOffsetMult: 0.025,        // Very small offset for "tiny degree"
    echoBaseAlpha: 0.35
};

const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

// --- Background Scroller Integration ---
const background = new BGScroller('simCanvas', {
    manualMode: true,
    speeds: {
        hill2: 0.2,
        hill1: 0.5,
        ground: 1.2,
        cloud: 0.3
    }
});

// Off-screen canvas for group transparency (Far side layering)
const offscreenCanvas = document.createElement('canvas');
const offCtx = offscreenCanvas.getContext('2d');
offscreenCanvas.width = canvas.width;
offscreenCanvas.height = canvas.height;

// Off-screen canvas for Full Robot capture (Used for Motion Blur)
const robotCanvas = document.createElement('canvas');
const robotCtx = robotCanvas.getContext('2d');
robotCanvas.width = canvas.width;
robotCanvas.height = canvas.height;

// Fixed Machine Geometry Constants
// Machine Geometry Parameters
let globalScale = 1.5;      // Global scaling factor
let pivotYOffset = 0.0;    // Y-offset for Pf and Pr (lower than middle)
let bodyYOffset = 8.0 * globalScale; // Vertical offset for the main body

let S = 48.0 * globalScale;
let groundY_Ideal = -51.5 * globalScale;
let Pf = { x: -S, y: -pivotYOffset * globalScale };
let Pr = { x: S, y: -pivotYOffset * globalScale };
let C_crank = { x: 0, y: 0 };

// State & Modifiable parameters
let currentCrankHoleY = 15.2; // Default to Hole 1
let crankDistances = [6.5, 11.0, 15.5, 20.0];
let R = crankDistances[0]; // Initial radius for Hole 1

let L_leg = 25.0 * globalScale;
let L_blue = 55.0 * globalScale;
let L_foot = 20.0 * globalScale; // 初始值調回 20.0
let gearboxShiftX = 0;

// SVG Path globals for dynamic scaling (legSVGPath is already declared in svgs.js)
let legSVG_h2y = 65; // Matches the default 45mm spacing in SVG units (20 + 45)

function updateLegSVGPath() {
    // h 是兩個安裝孔之間的 SVG 距離 (由 L_leg 決定)
    const h = (L_leg / (25.0 * globalScale)) * 45.0;
    legSVG_h2y = 20 + h;

    // 將物理腳長 L_foot 換算回相對於「第二個孔」的偏移量
    const footOffsetSVG = (L_foot / (25.0 * globalScale)) * 45.0;

    // 定義幾何常數，確保形狀不變
    const ellipseRY = 13;      // 腳掌橢圓的垂直半徑
    const ellipseRX = 25;      // 腳掌橢圓的水平半徑
    const transR = 15.5;       // 過渡圓弧半徑 (匹配用戶設定)
    const y_chord_offset_svg = 2.457; // large-arc-flag=1 產生的額外高度
    const curveHeight = transR + ellipseRY + y_chord_offset_svg; // 總曲線高度約 30.96

    // yOff1: 直線段結束與過渡圓弧開始的點 (相對於 Hole 1)
    // 讓直線段吸收 L_foot 的變化：Hole 2 到腳尖總長為 footOffsetSVG
    // 扣除掉固定的曲線高度後，剩下的就是直線段長度 (transitionY)
    const transitionY = Math.max(2, footOffsetSVG - curveHeight);
    const yOff1 = h + transitionY;

    // yOff2: 橢圓中心點的 Y 軸位置 (確保腳尖總長度正確)
    const yOff2 = h + (footOffsetSVG - ellipseRY);

    // 安全檢查：確保 finalY2 與 yOff1 之間維持固定的 transR 距離以保持圓弧形狀
    const finalY2 = yOff1 + transR;

    // 繪製路徑：所有半徑數值 (9, transR, ellipseRX, ellipseRY) 均為常數
    const legPath = `
        M 21, 20
        A 9,9 0 0, 1 39, 20
        L 39, ${20 + yOff1}
        A 15.5,15.5 0 0, 0 54.5, ${20 + finalY2}
        A 25, 13 0 1, 1 5.39, ${20 + finalY2}
        A 15.5,15.5 0 0, 0 21, ${20 + yOff1}
        Z`;
    const hole1 = `M 28.5, 20 a 1.5,1.5 0 1,0 3,0 a 1.5,1.5 0 1,0 -3,0`;
    const hole2 = `M 28.5, ${20 + h} a 1.5,1.5 0 1,0 3,0 a 1.5,1.5 0 1,0 -3,0`;

    legSVGPath = new Path2D(`${legPath} ${hole1} ${hole2}`);
}
// Initial generation
updateLegSVGPath();

// Gearbox Colors (Reference from 齒輪箱.html)
const gearboxFill = '#8a8d91';
const gearboxStroke = '#fdfbf7';
const gearboxAnnulusFill = '#808082';
const gearboxHoleFill = '#000000';

// Motor Colors (Reference from 馬達.html)
const motorLightGrey = '#e5e5e5';
const motorMediumGrey = '#bbbbbb';
const motorDarkGrey = '#7a7a7a';
const motorBronze = '#cd7f32';
const motorBronzeStroke = '#8b4513';

// Viewport Settings
const scale = 3.5;
const cx = canvas.width / 2;
// Keep ground line fixed at 20px from bottom (relative to canvas height)
let targetGy = canvas.height - 20;
let cy = targetGy + groundY_Ideal * scale;

/**
 * 根據背景層動態調整機器人高度
 * 定位於 ground1 與 ground2 頂端的中間線
 */
function updateRobotHeight() {
    if (!background || !background.isInitialized) {
        requestAnimationFrame(updateRobotHeight);
        return;
    }
    const top1 = background.getLayerTop(4); // ground1 (最底層)
    const top2 = background.getLayerTop(3); // ground2 (道路層)
    const ratio = 0.2;
    targetGy = (top1 + top2 * ratio) / (ratio + 1);
    cy = targetGy + groundY_Ideal * scale;
    updateCrankPosition(); // 同步更新曲柄位置
}
updateRobotHeight();


function updateCrankPosition() {
    const bodyDistancePx = bodyYOffset * scale;
    const barThicknessPx = 12;
    const targetDistPx = bodyDistancePx - (barThicknessPx / 2.0);
    const customGearboxScale = targetDistPx / 12.5; // distance from hole (cy=12.5) to bottom (cy=25)

    // Bottom tab is at x=18.5, crank hole is at x=25 (difference = 6.5)
    C_crank.x = gearboxShiftX;
    C_crank.y = -bodyYOffset + 2 + (12.5 * customGearboxScale / scale);
}

// Initial calculation
updateCrankPosition();

let theta = 0;
let phaseDiff = Math.PI; // 相位差預設 180 度 (Half-cycle out of phase)
let isPlaying = false; // 預設停止播放，使機器人靜態站立
let showPaths = false;
let simSpeed = -0.1;
let gravityScale = 1.0;
let isAdminMode = true; // Hidden Admin Authority
let overlayAlpha = 0;   // For smooth fade in/out
let isSlowMo = false;

let paths = { near: { f: [], m: [], r: [] }, far: { f: [], m: [], r: [] } };
const maxPathLen = 150;

let isLooping = false;
let playOnePeriod = false;
let accumulatedTheta = 0;

// 正向物理狀態變數
let bodyX = 0;
let prevBodyX = 0; // 追蹤上一幀的機身世界 X 座標，用於計算相對背景位移
let bodyY = 0; // 由觸地約束決定
let bodyRoll = 0; // 機身傾角 (弧度)
let bodyRollVel = 0;
const y_ground = 0; // 固定地面世界座標
let lockedPivotIndex = -1; // 鎖定的水平推進支點 (-1 表示未鎖定)
let pivotWorldX = 0; // 支點在世界坐標系中的固定位置
let prevBodyRoll = 0; // 追蹤上一幀的機身傾角
let prevFeetLocal = null; // 追蹤上一幀的所有腳掌相對於機身的坐標

// 統計與診斷相關變數（保留聲明以防止其他模組報錯）
let displayDist = 0;
let displayTime = 0;
let displaySpeed = 0;
let smoothedSpeed = 0;
let cycleAvgSpeed = 0;
let lastCycleX = 0;
let lastCycleTime = 0;
let prevTheta = 0;
let globalSimTime = 0;
let lastFrameTime = performance.now();

// --- Speed Visualization State ---
// Scenic objects removed as requested
// const particles = Array.from({ length: 40 }, () => new Particle());
// const trees = Array.from({ length: 6 }, () => new Tree());
// let speedParticles = Array.from({ length: speedVizConfig.particleCount }, () => new SpeedParticle());


// Viewport Settings (Moved to top to prevent ReferenceError)

/**
 * Transforms internal coordinates to screen space based on Camera POV
 * @param {Object} p - {x, y} coordinate
 * @param {boolean} includeHop - Whether to apply the dynamic bounce offset
 */
function mapCoords(p, includeHop = true) {
    // p.x, p.y 是相對於機身中心的座標
    const cosR = Math.cos(bodyRoll);
    const sinR = Math.sin(bodyRoll);
    // 1. 旋轉並平移至世界座標系 (不加 bodyX，使機器人在螢幕上水平靜止在起始位置)
    const rx = p.x * cosR - p.y * sinR;
    const ry = bodyY + p.x * sinR + p.y * cosR;
    // 2. 世界座標系轉螢幕座標系 (y 軸向上，y_ground = 0 對應螢幕的 targetGy)
    return { x: cx + rx * scale, y: targetGy - ry * scale };
}

function getIntersection(C1, r1, C2, r2) {
    const dx = C2.x - C1.x, dy = C2.y - C1.y;
    const d = Math.sqrt(dx * dx + dy * dy);

    if (d > r1 + r2 || d < Math.abs(r1 - r2) || d === 0) return null;

    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h_sq = r1 * r1 - a * a;
    const h = Math.sqrt(Math.max(0, h_sq));

    const P2x = C1.x + a * dx / d;
    const P2y = C1.y + a * dy / d;

    const P3a = { x: P2x - h * dy / d, y: P2y + h * dx / d };
    const P3b = { x: P2x + h * dy / d, y: P2y - h * dx / d };

    return (P3a.y > P3b.y) ? P3a : P3b;
}

function extendPoint(P_top, P_bottom, extLen) {
    const dx = P_bottom.x - P_top.x, dy = P_bottom.y - P_top.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return {
        x: P_bottom.x + (dx / dist) * extLen,
        y: P_bottom.y + (dy / dist) * extLen
    };
}

/**
 * 計算橢圓形腳部在給定地面斜率 m 下的最底端接觸點 (相對機器坐標系)
 * 幾何原理：基於橢圓的支撐函數 (Support Function) 與方向向量投影
 * 
 * @param {Object} P_top    腿部上端孔位 (由 FT/MT/RT 傳入)
 * @param {Object} P_bottom 腿部下端孔位 (由 Pf/ML/Pr 傳入)，即組件支點
 * @param {number} m        目前地面的斜率 (dy/dx)
 * @returns {Object}        橢圓腳部與地面碰撞的精確切點 {x, y}
 */
function getEllipticFootPoint(P_top, P_bottom, m = 0) {
    const dx = P_bottom.x - P_top.x, dy = P_bottom.y - P_top.y;
    const L_curr = Math.sqrt(dx * dx + dy * dy);
    if (L_curr === 0) return P_bottom;

    const phi = Math.atan2(dy, dx);
    const rot = phi - Math.PI / 2;

    const s_fixed = (25.0 * globalScale) / 45.0;
    const a = 24.555 * s_fixed; // 精確匹配 SVG 寬度 (54.5 - 5.39) / 2
    const b = 13 * s_fixed;

    // 計算 SVG 中因 large-arc-flag=1 產生的額外垂直高度補償
    const chord_half_width_svg = 24.555;
    const y_chord_offset = Math.sqrt(Math.max(0, b * b * (1 - Math.pow(chord_half_width_svg * s_fixed / a, 2))));

    // 核心修正：考慮到視覺上的足部比單純的 b 還要深 y_chord_offset
    // 增加 0.2 緩衝確保紅點壓在邊線上
    const centerDist = L_foot - b - y_chord_offset + (0.2 * globalScale);

    const Cx = P_bottom.x + (dx / L_curr) * centerDist;
    const Cy = P_bottom.y + (dy / L_curr) * centerDist;

    const sinR = Math.sin(rot), cosR = Math.cos(rot);
    const n_u = sinR - m * cosR;
    const n_v = cosR + m * sinR;

    const h = Math.sqrt(a * a * n_u * n_u + b * b * n_v * n_v);

    const dx_rel_top = (a * a * n_u * cosR - b * b * n_v * sinR) / h;
    const dy_rel_top = (a * a * n_u * sinR + b * b * n_v * cosR) / h;

    const dx_cp = -dx_rel_top;
    const dy_cp = -dy_rel_top;

    return { x: Cx + dx_cp, y: Cy + dy_cp };
}

function getLegPositions(angle, groundM = 0) {
    const ML = {
        x: C_crank.x + R * Math.cos(angle),
        y: C_crank.y + R * Math.sin(angle)
    };
    const MT = getIntersection(ML, L_leg, Pf, L_blue);
    const FT = getIntersection(Pf, L_leg, ML, L_blue);
    const RT = getIntersection(Pr, L_leg, ML, L_blue);

    if (!MT || !FT || !RT) return null;

    const foot_f = getEllipticFootPoint(FT, Pf, groundM);
    const foot_m = getEllipticFootPoint(MT, ML, groundM);
    const foot_r = getEllipticFootPoint(RT, Pr, groundM);

    return { ML, MT, FT, RT, foot_f, foot_m, foot_r };
}

// --- Drawing Core ---

function drawSVGLink(p1, p2, svgPath, h1x, h1y, h2x, h2y, strokeColor, fillColor, isFar, targetCtx = ctx) {
    if (!p1 || !p2 || !svgPath) return; // 確保路徑物件已存在
    const m1 = mapCoords(p1), m2 = mapCoords(p2);
    const dx = m2.x - m1.x, dy = m2.y - m1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const svgDist = Math.sqrt(Math.pow(h2x - h1x, 2) + Math.pow(h2y - h1y, 2));
    const scale = dist / svgDist;
    const angle = Math.atan2(dy, dx);
    const svgAngle = Math.atan2(h2y - h1y, h2x - h1x);

    targetCtx.save();
    targetCtx.translate(m1.x, m1.y);
    targetCtx.rotate(angle - svgAngle);
    targetCtx.scale(scale, scale);
    targetCtx.translate(-h1x, -h1y);

    targetCtx.globalAlpha = 1.0; // Layering handled by opaque drawing in group
    targetCtx.strokeStyle = strokeColor;
    targetCtx.lineWidth = 1.5 / scale;
    if (fillColor) {
        targetCtx.fillStyle = fillColor;
        targetCtx.fill(svgPath);
    }
    targetCtx.stroke(svgPath);
    targetCtx.restore();
}

function drawLine(p1, p2, color, width, targetCtx = ctx) {
    if (!p1 || !p2) return;
    const m1 = mapCoords(p1), m2 = mapCoords(p2);
    targetCtx.beginPath();
    targetCtx.moveTo(m1.x, m1.y);
    targetCtx.lineTo(m2.x, m2.y);
    targetCtx.strokeStyle = color;
    targetCtx.lineWidth = width;
    targetCtx.lineCap = 'round';
    targetCtx.stroke();
}

function drawPath(pathArray, color, dash, includeHop = true) {
    if (!showPaths || pathArray.length < 2) return;
    ctx.beginPath();
    const start = mapCoords(pathArray[0], includeHop);
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i < pathArray.length; i++) {
        const pt = mapCoords(pathArray[i], includeHop);
        ctx.lineTo(pt.x, pt.y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    if (dash) ctx.setLineDash(dash);
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawPoint(p, color, radius, targetCtx = ctx, includeHop = true) {
    if (!p) return;
    const mp = mapCoords(p, includeHop);
    targetCtx.beginPath();
    targetCtx.arc(mp.x, mp.y, radius, 0, Math.PI * 2);
    targetCtx.fillStyle = color;
    targetCtx.fill();
}

function renderSide(data, isFar, targetCtx = ctx) {
    const jointColor = isFar ? '#334155' : '#1e293b'; // Slightly different for Far
    const widthScale = isFar ? 0.8 : 1.0;

    // Define drawing parts
    const drawCrank = () => {
        const crankFill = isFar ? '#f1f5f9' : '#e2e8f0';
        const crankStroke = isFar ? '#cbd5e1' : '#94a3b8';
        if (typeof crankSVGPath !== 'undefined') {
            drawSVGLink(C_crank, data.ML, crankSVGPath, 8.7, 8.7, 8.7, currentCrankHoleY, crankStroke, crankFill, isFar, targetCtx);
        } else {
            const crankColor = isFar ? '#e2e8f0' : '#cbd5e1';
            drawLine(C_crank, data.ML, crankColor, 4 * widthScale, targetCtx);
        }
    };

    const drawRods = (isFar) => {
        const rodFill = isFar ? '#93c5fd' : '#3b82f6';
        const rodStroke = isFar ? '#60a5fa' : '#1d4ed8';
        if (isFar) {
            drawSVGLink(data.FT, data.ML, rodSVGPath, 10, 10, 10, 102, rodStroke, rodFill, isFar, targetCtx);
            drawSVGLink(Pf, data.MT, rodSVGPath, 10, 10, 10, 102, rodStroke, rodFill, isFar, targetCtx);
            drawSVGLink(data.ML, data.RT, rodSVGPath, 10, 10, 10, 102, rodStroke, rodFill, isFar, targetCtx);
        } else {
            drawSVGLink(data.ML, data.RT, rodSVGPath, 10, 10, 10, 102, rodStroke, rodFill, isFar, targetCtx);
            drawSVGLink(Pf, data.MT, rodSVGPath, 10, 10, 10, 102, rodStroke, rodFill, isFar, targetCtx);
            drawSVGLink(data.FT, data.ML, rodSVGPath, 10, 10, 10, 102, rodStroke, rodFill, isFar, targetCtx);
        }
    };

    const drawLegs = () => {
        const legFill = isFar ? '#fef08a' : '#facc15';
        const legStroke = isFar ? '#fde047' : '#b45309';
        drawSVGLink(data.FT, Pf, legSVGPath, 30, 20, 30, legSVG_h2y, legStroke, legFill, isFar, targetCtx);
        drawSVGLink(data.MT, data.ML, legSVGPath, 30, 20, 30, legSVG_h2y, legStroke, legFill, isFar, targetCtx);
        drawSVGLink(data.RT, Pr, legSVGPath, 30, 20, 30, legSVG_h2y, legStroke, legFill, isFar, targetCtx);
    };

    // Execute drawing based on final depth requirements
    if (isFar) {
        // Far Side: Rod (Bottom) → Leg (Middle) → Crank (Top)
        drawRods(isFar);
        drawLegs();
        drawCrank();
    } else {
        // Near Side: Crank (Bottom) → Leg (Middle) → Rod (Top)
        drawCrank();
        drawLegs();
        drawRods(isFar);
    }

    // Joints always on top
    drawPoint(data.ML, jointColor, 4 * widthScale, targetCtx);
    drawPoint(data.FT, jointColor, 4 * widthScale, targetCtx);
    drawPoint(data.MT, jointColor, 4 * widthScale, targetCtx);
    drawPoint(data.RT, jointColor, 4 * widthScale, targetCtx);
}

/**
 * 繪製單個足部在地面上的陰影
 */
/**
 * 繪製單個足部在地面上的陰影
 * @param {Object} footPosWorld - 足部在世界座標系下的位置 {x, y}
 */
function drawFootShadow(footLocal) {
    const visualPos = mapCoords(footLocal);
    const distPx = targetGy - visualPos.y;
    const dist = Math.max(0, distPx / scale);
    const maxDist = 35 * globalScale;
    const opacity = Math.max(0, 0.25 * (1 - dist / maxDist));
    if (opacity <= 0) return;

    const baseWidth = 14 * scale;
    const baseHeight = 4 * scale;
    const sizeMult = 1 - (dist / maxDist) * 0.4;
    const width = baseWidth * sizeMult;
    const height = baseHeight * sizeMult;

    ctx.save();
    ctx.translate(visualPos.x, targetGy);
    ctx.beginPath();
    ctx.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
    ctx.fill();
    ctx.restore();
}

/**
 * 基於二維靜力平衡 (力與力矩平衡) 計算每個觸地腳掌分配到的法向力權重
 */
function computeNormalForces(groundedIndices, allFeetLocal, roll) {
    const cosR = Math.cos(roll);
    const sinR = Math.sin(roll);
    
    // 1. 計算每個觸地腳相對於機身中心的水平位移 d_i
    let feet = groundedIndices.map(idx => {
        const f = allFeetLocal[idx];
        const d = f.x * cosR - f.y * sinR;
        return { idx, d, w: 0 };
    });
    
    // 2. 作用力集方法 (Active Set Method) 求解非負最小二乘權重 (確保 w_i >= 0 且 sum(w_i d_i) = 0)
    let active = [...feet];
    while (active.length > 0) {
        const N = active.length;
        if (N === 1) {
            active[0].w = 1.0;
            break;
        }
        
        let S1 = 0, S2 = 0;
        for (let f of active) {
            S1 += f.d;
            S2 += f.d * f.d;
        }
        
        const denom = S1 * S1 - N * S2;
        if (Math.abs(denom) < 1e-5) {
            for (let f of active) f.w = 1.0 / N;
            break;
        }
        
        let hasNegative = false;
        for (let f of active) {
            f.w = (S1 * f.d - S2) / denom;
            if (f.w < -1e-5) {
                hasNegative = true;
            }
        }
        
        if (!hasNegative) {
            break; 
        }
        
        // 排序並移除最負的那個權重腳掌重新計算
        active.sort((a, b) => a.w - b.w);
        active.shift(); 
    }
    
    // 3. 回填並歸一化
    let weights = {};
    let sum = 0;
    for (let f of feet) {
        weights[f.idx] = Math.max(0, f.w);
        sum += weights[f.idx];
    }
    
    if (sum > 1e-5) {
        for (let idx of groundedIndices) weights[idx] /= sum;
    } else {
        for (let idx of groundedIndices) weights[idx] = 1.0 / groundedIndices.length;
    }
    
    return weights;
}

/**
 * Main Render and Physics Logic Loop
 */
function renderFrame(currentTheta, recordPath, dt = 0.016) {
    // 1. 基於固定水平面求解幾何 (斜率 m = 0)
    const near = getLegPositions(currentTheta, 0);
    const far = getLegPositions(currentTheta + phaseDiff, 0);

    // 更新幾何衝突狀態
    isClashing = (near === null || far === null);

    let deltaX = 0;

    if (near && far) {
        const allFeetLocal = [
            near.foot_f, near.foot_m, near.foot_r,
            far.foot_f, far.foot_m, far.foot_r
        ];

        // 2. 幾何約束求解：找出最低的兩隻支撐腳
        let bestY = -Infinity;
        let bestRoll = 0;
        let bestPair = null;

        for (let i = 0; i < 6; i++) {
            for (let j = i + 1; j < 6; j++) {
                const p1 = allFeetLocal[i];
                const p2 = allFeetLocal[j];
                
                // 為了數值穩定，兩隻腳在 x 軸上的距離不能太近
                if (Math.abs(p1.x - p2.x) < 5.0) continue;

                // 求解使這兩腳剛好切齊地面的 bodyRoll (使用 Math.atan 確保傾角在 -90 到 90 度範圍內)
                const roll = Math.atan((p2.y - p1.y) / (p1.x - p2.x));
                
                // 求解對應的機身高度 bodyY
                const tempY = -(p1.x * Math.sin(roll) + p1.y * Math.cos(roll));

                // 物理限制：防止機身翻轉（機身中心必須高於地面，且傾角不得大於 45°）
                if (tempY < 0 || Math.abs(roll) > Math.PI / 4) continue;

                // 檢查是否有任何腳會穿透地面
                let isValid = true;
                for (let k = 0; k < 6; k++) {
                    const pk = allFeetLocal[k];
                    const y_world_k = tempY + pk.x * Math.sin(roll) + pk.y * Math.cos(roll);
                    if (y_world_k < -0.1) { // 允許極小的浮點誤差
                        isValid = false;
                        break;
                    }
                }

                // 在所有合法的支撐對中，選擇能把機身撐得最高（bodyY 最大）的組合
                if (isValid && tempY > bestY) {
                    bestY = tempY;
                    bestRoll = roll;
                    bestPair = [i, j];
                }
            }
        }

        let groundedIndices = [];

        // Spring-damper 參數 (可調整手感)
        const rollStiffness = 400; // rad/s²  越大越快跟上目標角度
        const rollDamping   = 30;  // /s       越大越快停止振盪

        if (bestPair !== null) {
            // Spring-damper：讓 bodyRoll 平滑趨向幾何目標角 bestRoll，而非瞬間跳躍
            const rollErr = bestRoll - bodyRoll;
            bodyRollVel += rollErr * rollStiffness * dt;
            bodyRollVel -= bodyRollVel * rollDamping * dt;
            bodyRoll += bodyRollVel * dt;

            // 從當前 bodyRoll (非目標) 重新計算 bodyY，使最低的支撐腳切齊地面
            // 取兩腳所需高度的最大值，確保任一腳都不穿地
            const p1 = allFeetLocal[bestPair[0]];
            const p2 = allFeetLocal[bestPair[1]];
            const y1 = -(p1.x * Math.sin(bodyRoll) + p1.y * Math.cos(bodyRoll));
            const y2 = -(p2.x * Math.sin(bodyRoll) + p2.y * Math.cos(bodyRoll));
            bodyY = Math.max(y1, y2);

            groundedIndices = bestPair;
        } else {
            // 單腳支撐：Spring 回水平（目標 roll = 0）
            const rollErr = 0 - bodyRoll;
            bodyRollVel += rollErr * rollStiffness * dt;
            bodyRollVel -= bodyRollVel * rollDamping * dt;
            bodyRoll += bodyRollVel * dt;

            // 設定高度，使最低的腳剛好切齊地面 y = 0
            bodyY = -Math.min(...allFeetLocal.map(f => f.x * Math.sin(bodyRoll) + f.y * Math.cos(bodyRoll)));

            // 找出此時最低（在世界座標中）的腳掌作為觸地腳
            let lowestIdx = 0;
            let lowestVal = Infinity;
            for (let i = 0; i < 6; i++) {
                const pk = allFeetLocal[i];
                const worldY = bodyY + pk.x * Math.sin(bodyRoll) + pk.y * Math.cos(bodyRoll);
                if (worldY < lowestVal) {
                    lowestVal = worldY;
                    lowestIdx = i;
                }
            }
            groundedIndices = [lowestIdx];
        }

        // 3. 物理動力學位移積分：根據靜力平衡分配的法向力 (正常重力分量)，加權累加各觸地腳的位移，計算最真實的無打滑機身位移
        if (groundedIndices.length > 0) {
            if (prevFeetLocal === null) {
                prevFeetLocal = allFeetLocal.map(f => ({ x: f.x, y: f.y }));
                prevBodyRoll = bodyRoll;
                lockedPivotIndex = groundedIndices[0];
            }

            const weights = computeNormalForces(groundedIndices, allFeetLocal, bodyRoll);

            // 視覺高亮顯示：選擇當前承受法向力最大 (重量分配最多) 的腳掌作為主支點
            let maxWeightIdx = groundedIndices[0];
            let maxWeight = -1;
            for (let idx of groundedIndices) {
                if (weights[idx] > maxWeight) {
                    maxWeight = weights[idx];
                    maxWeightIdx = idx;
                }
            }
            lockedPivotIndex = maxWeightIdx;

            // 機身水平位移積分
            let deltaBodyX = 0;
            const cosR = Math.cos(bodyRoll);
            const sinR = Math.sin(bodyRoll);
            const cosRPrev = Math.cos(prevBodyRoll);
            const sinRPrev = Math.sin(prevBodyRoll);

            for (let idx of groundedIndices) {
                const f = allFeetLocal[idx];
                const fPrev = prevFeetLocal[idx];

                // 腳掌在世界坐標的相對水平坐標 x'
                const x_curr = f.x * cosR - f.y * sinR;
                const x_prev = fPrev.x * cosRPrev - fPrev.y * sinRPrev;

                deltaBodyX -= weights[idx] * (x_curr - x_prev);
            }

            bodyX = prevBodyX + deltaBodyX;

            prevFeetLocal = allFeetLocal.map(f => ({ x: f.x, y: f.y }));
            prevBodyRoll = bodyRoll;
        } else {
            prevFeetLocal = null;
        }

        // 計算本幀的水平位移量 (像素)
        deltaX = (bodyX - prevBodyX) * scale;
        prevBodyX = bodyX;
    }

    // --- 開始繪製背景與機器人 ---
    const cx = canvas.width / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 更新背景位移與渲染背景
    background.update(deltaX);
    background.render(ctx);

    if (near && far) {
        const allFeetLocal = [
            near.foot_f, near.foot_m, near.foot_r,
            far.foot_f, far.foot_m, far.foot_r
        ];

        // 4. 計算各腳掌在世界座標系下的位置
        const allFeetWorld = allFeetLocal.map(f => ({
            x: bodyX + f.x * Math.cos(bodyRoll) - f.y * Math.sin(bodyRoll),
            y: bodyY + f.x * Math.sin(bodyRoll) + f.y * Math.cos(bodyRoll)
        }));

        // 3. 繪製足部在地面上的陰影 (將 world 傳參改為 local 傳參)
        allFeetLocal.forEach(f => drawFootShadow(f));

        // 4. 繪製固定水平地平面 (世界座標 y = 0 對應螢幕的 targetGy)
        ctx.beginPath();
        ctx.moveTo(0, targetGy);
        ctx.lineTo(canvas.width, targetGy);
        ctx.strokeStyle = '#334155'; // 暗板岩色地面線
        ctx.lineWidth = 3;
        ctx.stroke();

        // 5. 渲染 Far 側腳 (繪製至 offscreen Canvas 以處理半透明)
        offCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
        renderSide(far, true, offCtx);

        // 6. 渲染機器人整體結構 (利用 robotCanvas 做快取)
        robotCtx.clearRect(0, 0, robotCanvas.width, robotCanvas.height);
        
        // 繪製 Far 側
        robotCtx.save();
        robotCtx.globalAlpha = 0.75;
        robotCtx.drawImage(offscreenCanvas, 0, 0);
        robotCtx.restore();

        // 繪製連接件與機身主樑 (使用相對機身中心的局部高度 bodyYLocal)
        const bodyYLocal = -bodyYOffset;
        const connection_width = 12;
        drawLine(Pf, { x: Pf.x, y: bodyYLocal }, '#64748b', connection_width, robotCtx);
        drawLine(Pr, { x: Pr.x, y: bodyYLocal }, '#64748b', connection_width, robotCtx);

        // 繪製馬達與齒輪箱
        const bodyCenterPos = mapCoords({ x: gearboxShiftX, y: bodyYLocal });
        const bp1 = mapCoords({ x: -S, y: bodyYLocal });
        const bp2 = mapCoords({ x: S, y: bodyYLocal });
        const bodyAngle = Math.atan2(bp2.y - bp1.y, bp2.x - bp1.x);
        const customGearboxScale = (bodyYOffset * scale - 6) / 12.5;

        robotCtx.save();
        robotCtx.translate(bodyCenterPos.x, bodyCenterPos.y);
        robotCtx.rotate(bodyAngle);
        robotCtx.scale(customGearboxScale, customGearboxScale);

        // 繪製馬達
        robotCtx.save();
        robotCtx.translate(27.0, -24.5);
        robotCtx.fillStyle = motorLightGrey;
        robotCtx.fillRect(0, 0, 10.5, 4);
        robotCtx.fillRect(0, 16, 10.5, 4);
        robotCtx.fillStyle = motorMediumGrey;
        robotCtx.fillRect(0, 4, 10.5, 12);
        robotCtx.fillStyle = '#ffffff';
        robotCtx.fillRect(10.5, 0, 5, 20);
        robotCtx.fillStyle = motorDarkGrey;
        robotCtx.fillRect(10.5, 6.25, 3, 7.5);
        robotCtx.fillStyle = '#f0f0f0';
        robotCtx.fillRect(15.5, 5, 2.5, 10);
        robotCtx.fillStyle = '#DCDCDC';
        robotCtx.fillRect(18.0, 9, 1.0, 2);

        robotCtx.strokeStyle = '#333333';
        robotCtx.lineWidth = 0.1;
        if (typeof motorSVGPath !== 'undefined') {
            robotCtx.stroke(motorSVGPath);
        }

        const drawBronze = (bx, by, isBottom) => {
            robotCtx.fillStyle = motorBronze;
            robotCtx.strokeStyle = motorBronzeStroke;
            robotCtx.lineWidth = 0.1;
            robotCtx.beginPath();
            if (!isBottom) {
                robotCtx.moveTo(bx, by); robotCtx.lineTo(bx, by - 3);
                robotCtx.arc(bx + 1, by - 3, 1, Math.PI, 0);
                robotCtx.lineTo(bx + 2, by);
            } else {
                robotCtx.moveTo(bx, by); robotCtx.lineTo(bx, by + 3);
                robotCtx.arc(bx + 1, by + 3, 1, Math.PI, 0, true);
                robotCtx.lineTo(bx + 2, by);
            }
            robotCtx.closePath();
            robotCtx.fill(); robotCtx.stroke();

            robotCtx.fillStyle = '#ffffff';
            robotCtx.beginPath();
            if (!isBottom) {
                robotCtx.moveTo(bx + 0.5, by - 1); robotCtx.lineTo(bx + 0.5, by - 2.5);
                robotCtx.arc(bx + 1, by - 2.5, 0.5, Math.PI, 0);
                robotCtx.lineTo(bx + 1.5, by - 1);
            } else {
                robotCtx.moveTo(bx + 0.5, by + 1); robotCtx.lineTo(bx + 0.5, by + 2.5);
                robotCtx.arc(bx + 1, by + 2.5, 0.5, Math.PI, 0, true);
                robotCtx.lineTo(bx + 1.5, by + 1);
            }
            robotCtx.closePath();
            robotCtx.fill(); robotCtx.stroke();
        };
        drawBronze(11.5, 6.25, false);
        drawBronze(11.5, 13.75, true);
        robotCtx.restore();

        // 繪製齒輪箱
        robotCtx.save();
        robotCtx.translate(-25.0, -27);
        robotCtx.fillStyle = gearboxFill;
        robotCtx.strokeStyle = gearboxStroke;
        robotCtx.lineWidth = 1.5 / customGearboxScale;
        if (typeof gearboxSVGPath !== 'undefined') {
            robotCtx.fill(gearboxSVGPath);
            robotCtx.stroke(gearboxSVGPath);
        }
        const drawHoleDetail = (cx, cy) => {
            robotCtx.beginPath(); robotCtx.arc(cx, cy, 3.5, 0, Math.PI * 2);
            robotCtx.fillStyle = gearboxAnnulusFill; robotCtx.fill(); robotCtx.stroke();
            robotCtx.beginPath(); robotCtx.arc(cx, cy, 1.5, 0, Math.PI * 2);
            robotCtx.fillStyle = gearboxHoleFill; robotCtx.fill(); robotCtx.stroke();
        };
        drawHoleDetail(11.5, 12.5);
        drawHoleDetail(25.0, 12.5);
        robotCtx.restore();

        robotCtx.restore();

        // 繪製機身主橫梁結構
        drawLine({ x: -S - 15, y: bodyYLocal }, { x: S + 15, y: bodyYLocal }, '#94a3b8', 12, robotCtx);
        drawPoint(Pf, '#0f172a', 6, robotCtx);
        drawPoint(Pr, '#0f172a', 6, robotCtx);
        drawPoint(C_crank, '#ef4444', 7, robotCtx);

        // 渲染 Near 側腳
        renderSide(near, false, robotCtx);

        // 繪製快取畫布至螢幕
        ctx.drawImage(robotCanvas, 0, 0);

        // --- 高亮著地足 (當前最底部的腳掌在世界座標 y < 0.1) ---
        if (overlayAlpha > 0.01) {
            ctx.save();
            ctx.globalAlpha = overlayAlpha;
            for (let i = 0; i < 6; i++) {
                const f_world = allFeetWorld[i];
                if (f_world.y < 0.1) {
                    const f_local = allFeetLocal[i];
                    drawPoint(f_local, '#ef4444', 5, ctx);
                    const mp = mapCoords(f_local);
                    ctx.beginPath();
                    ctx.arc(mp.x, mp.y, 10, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            }
            ctx.restore();
        }

    } else {
        ctx.fillStyle = '#f87171';
        ctx.font = 'bold 22px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('幾何約束衝突！請嘗試減小曲柄半徑。', canvas.width / 2, canvas.height / 2);
    }

    // 8. 繪製統計數據面板 (僅在管理員模式下顯示)
    if (overlayAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = overlayAlpha;
        drawOverlayStats();
        ctx.restore();
    }

    // 紀錄數據用於 AI 診斷
    if (typeof recordAnalyticsData === 'function') {
        recordAnalyticsData();
    }
}


function drawOverlayStats() {
    const w = 260;
    const h = 135;
    const x = canvas.width - w - 20;
    const y = 20;


    // 1. Background with rounded corners
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 12);
        ctx.fill();
    } else {
        ctx.fillRect(x, y, w, h);
    }

    // 2. Accent Bar
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(x, y + 10, 4, h - 20);

    // 3. Title
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 15px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText('單腳觸地推進數據', x + 20, y + 35);

    // 4. Data Rows (Left Label, Right Value)
    const drawRow = (label, value, color, ty) => {
        ctx.textAlign = 'left';
        ctx.font = '14px system-ui';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(label, x + 20, ty);

        ctx.textAlign = 'right';
        ctx.font = 'bold 14px "JetBrains Mono", monospace';
        ctx.fillStyle = color;
        ctx.fillText(value, x + w - 20, ty);
    };

    drawRow('前次腳步推進:', `${displayDist.toFixed(1)} mm`, '#38bdf8', y + 68);
    drawRow('前次腳步均速:', `${displaySpeed.toFixed(1)} mm/s`, '#34d399', y + 93);
    drawRow('當前移動速度:', `${smoothedSpeed.toFixed(1)} mm/s`, '#facc15', y + 118);
}

function animate() {
    let now = performance.now();
    let dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    if (isPlaying) {
        // 確保參數化 SVG 在最初幾幀能成功覆蓋 svgs.js 的非同步加載結果
        if (globalSimTime < 1.0) updateLegSVGPath();

        const factor = isSlowMo ? 0.2 : 1.0;
        theta += simSpeed * factor;
        globalSimTime += dt * factor;

        // Track cycle completion for averaging (when theta crosses 0)
        // Check for wrapping in both directions
        const crossedZero = (prevTheta > theta && simSpeed > 0) || (prevTheta < theta && simSpeed < 0);
        if (crossedZero) {
            const dx = Math.abs(bodyX - lastCycleX);
            const dt_cycle = globalSimTime - lastCycleTime;
            if (dt_cycle > 0.05) { // Minimum 0.05s to avoid tiny slivers
                const newAvg = dx / dt_cycle;
                // Blend cycle average for smoothness, but faster responsive if it was 0
                const alpha = cycleAvgSpeed === 0 ? 1.0 : 0.3;
                cycleAvgSpeed = (1 - alpha) * cycleAvgSpeed + alpha * newAvg;
            }
            lastCycleX = bodyX;
            lastCycleTime = globalSimTime;
        }
        prevTheta = theta;

        if (playOnePeriod) {
            accumulatedTheta += Math.abs(simSpeed);
            if (accumulatedTheta >= Math.PI * 2) {
                isPlaying = false;
                playOnePeriod = false;
                accumulatedTheta = 0;
                document.getElementById('toggleBtn').innerText = "恢復自動播放";
            }
        }
        if (theta > Math.PI * 2) theta -= Math.PI * 2;
        if (theta < 0) theta += Math.PI * 2;

        // Whatever the direction is, the slider should move from left to right (0 to 360)
        // If simulation is running backwards (simSpeed < 0), theta goes down. 
        // We invert the visualization so the slider naturally progresses forward.
        let displayTheta = theta;
        if (simSpeed < 0) {
            displayTheta = Math.PI * 2 - theta;
        }

        const deg = Math.round((displayTheta / Math.PI) * 180) % 360;
        document.getElementById('angleSlider').value = deg;
        document.getElementById('angleVal').innerText = deg + '°';
    }

    renderFrame(theta, isPlaying, dt);

    if (isPlaying || (isAdminMode && overlayAlpha < 1) || (!isAdminMode && overlayAlpha > 0)) {
        isLooping = true;
        requestAnimationFrame(animate);
    } else {
        isLooping = false;
        renderFrame(theta, false, 0); // Final render to update UI
    }

    // Update overlay Alpha for smooth fade
    const fadeSpeed = 0.05;
    if (isAdminMode) overlayAlpha = Math.min(1, overlayAlpha + fadeSpeed);
    else overlayAlpha = Math.max(0, overlayAlpha - fadeSpeed);

    // Update environment only when running or in physics motion
    // (Scenic updates removed)

}

function triggerUpdate() {
    if (!isLooping) {
        lastFrameTime = performance.now(); // Reset time to avoid large jumps when unpausing
        prevBodyX = bodyX; // 同步 prevBodyX 避免暫停後恢復播放時背景瞬間跳變！
        bodyRollVel = 0; // 重置動力學角速度避免速度累積
        animate();
    }
}

// --- Event Handlers ---

document.getElementById('toggleBtn').addEventListener('click', (e) => {
    isPlaying = !isPlaying;
    playOnePeriod = false;
    e.target.innerText = isPlaying ? "暫停自動播放" : "恢復自動播放";
    triggerUpdate();
});

document.getElementById('reverseBtn').addEventListener('click', () => {
    simSpeed = -simSpeed;
});

document.getElementById('periodBtn').addEventListener('click', () => {
    isPlaying = true;
    playOnePeriod = true;
    accumulatedTheta = 0;
    document.getElementById('toggleBtn').innerText = "暫停自動播放";
    triggerUpdate();
});

document.getElementById('clearBtn').addEventListener('click', () => {
    paths = { near: { f: [], m: [], r: [] }, far: { f: [], m: [], r: [] } };
    renderFrame(theta, false);
});

document.getElementById('showPathsCheck').addEventListener('change', (e) => {
    showPaths = e.target.checked;
    triggerUpdate();
});

document.getElementById('slowMoBtn').addEventListener('click', (e) => {
    isSlowMo = !isSlowMo;
    e.target.classList.toggle('active', isSlowMo);
    triggerUpdate();
});

document.getElementById('speedSlider').addEventListener('input', (e) => {
    let speedMagnitude = parseFloat(e.target.value);
    // Keep current rotation direction
    simSpeed = simSpeed < 0 ? -speedMagnitude : speedMagnitude;
    let speedText = "";
    if (speedMagnitude <= 0.1) speedText = "Low in battery";
    else if (speedMagnitude >= 0.2) speedText = "New battery";
    else {
        let pct = Math.round(((speedMagnitude - 0.1) / 0.1) * 100);
        speedText = `Battery: ${pct}%`;
    }
    document.getElementById('speedVal').innerText = speedText;
    gravityScale = 1.0 + (speedMagnitude * 5);
});

// --- Hidden Admin Trigger (Triple-click on Battery label) ---
let clickCount = 0;
let lastClickTime = 0;
document.getElementById('speedVal').addEventListener('click', () => {
    const now = Date.now();
    if (now - lastClickTime < 600) {
        clickCount++;
    } else {
        clickCount = 1;
    }
    lastClickTime = now;

    if (clickCount >= 3) {
        isAdminMode = !isAdminMode;
        const panel = document.querySelector('.control-panel');
        panel.classList.toggle('admin-mode', isAdminMode);
        console.log("Admin Authority: " + (isAdminMode ? "Enabled" : "Disabled"));
        clickCount = 0; // Reset
        triggerUpdate(); // Refresh to show/hide overlay
    }
});

document.getElementById('hopStrengthSlider').addEventListener('input', (e) => {
    hopStrength = parseFloat(e.target.value);
    document.getElementById('hopStrengthVal').innerText = hopStrength.toFixed(2);
    triggerUpdate();
});

document.getElementById('hopDampingSlider').addEventListener('input', (e) => {
    hopDamping = parseFloat(e.target.value);
    document.getElementById('hopDampingVal').innerText = hopDamping.toFixed(2);
    triggerUpdate();
});

document.getElementById('angleSlider').addEventListener('input', (e) => {
    let deg = parseInt(e.target.value);

    // User Request: Slider always moves 0->360 mapping.
    // So if we are in "reverse" mode, a slider value of 30deg actually means internal theta is 330deg.
    let targetTheta = (deg / 180) * Math.PI;
    if (simSpeed < 0) {
        targetTheta = Math.PI * 2 - targetTheta;
    }

    theta = targetTheta;
    document.getElementById('angleVal').innerText = deg + '°';
    triggerUpdate();
});

document.getElementById('phaseSlider').addEventListener('input', (e) => {
    let deg = parseInt(e.target.value);
    phaseDiff = (deg / 180) * Math.PI;
    document.getElementById('phaseVal').innerText = deg + '°';
    paths = { near: { f: [], m: [], r: [] }, far: { f: [], m: [], r: [] } };
    prevFeetLocal = null;
    triggerUpdate();
});

const setupSlider = (id, valId, callback) => {
    document.getElementById(id).addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById(valId).innerText = val;
        callback(val * globalScale); // Apply globalScale here
        paths = { near: { f: [], m: [], r: [] }, far: { f: [], m: [], r: [] } };
        prevFeetLocal = null;
        triggerUpdate();
    });
};

setupSlider('lLegSlider', 'lLegVal', (v) => {
    L_leg = v;
    updateLegSVGPath();
});
setupSlider('lBlueSlider', 'lBlueVal', (v) => L_blue = v);
setupSlider('lFootSlider', 'lFootVal', (v) => {
    L_foot = v;
    updateLegSVGPath();
});
setupSlider('gearboxShiftSlider', 'gearboxShiftVal', (v) => {
    gearboxShiftX = v / globalScale;
    updateCrankPosition(); // Sync physical pivot with visual gearbox
    paths = { near: { f: [], m: [], r: [] }, far: { f: [], m: [], r: [] } };
    triggerUpdate();
});

setupSlider('sSlider', 'sVal', (v) => {
    S = v;
    Pf.x = -S;
    Pr.x = S;
    paths = { near: { f: [], m: [], r: [] }, far: { f: [], m: [], r: [] } };
    triggerUpdate();
});

function resetParameters() {
    simSpeed = -0.1;
    phaseDiff = Math.PI;
    theta = 0;
    L_leg = 25.0 * globalScale;
    L_blue = 55.0 * globalScale;
    L_foot = 20.0 * globalScale;
    gearboxShiftX = 0;
    S = 48.0 * globalScale;
    Pf.x = -S;
    Pr.x = S;
    currentCrankHoleY = 15.2;
    R = crankDistances[0];

    // 2. Update UI Sliders
    document.getElementById('speedSlider').value = 0.1;
    document.getElementById('speedVal').innerText = "Low in battery";
    document.getElementById('phaseSlider').value = 180;
    document.getElementById('phaseVal').innerText = "180°";
    document.getElementById('angleSlider').value = 0;
    document.getElementById('angleVal').innerText = "0°";
    document.getElementById('lLegSlider').value = 25;
    document.getElementById('lLegVal').innerText = "25";
    document.getElementById('lBlueSlider').value = 55;
    document.getElementById('lBlueVal').innerText = "55";
    document.getElementById('gearboxShiftSlider').value = 0;
    document.getElementById('gearboxShiftVal').innerText = "0";
    document.getElementById('sSlider').value = 48;
    document.getElementById('sVal').innerText = "48";

    // L_foot sync
    document.getElementById('lFootSlider').value = 20.0;
    document.getElementById('lFootVal').innerText = "20.0";

    // 3. Update Hole Buttons UI
    holeButtons.forEach((btn, idx) => {
        if (idx === 0) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // 4. Update internal states and visual assets
    updateLegSVGPath();
    updateCrankPosition();
    paths = { near: { f: [], m: [], r: [] }, far: { f: [], m: [], r: [] } };

    // 重設正向物理狀態
    bodyX = 0;
    prevBodyX = 0;
    bodyY = 0;
    bodyRoll = 0;
    bodyRollVel = 0;
    lockedPivotIndex = -1;
    pivotWorldX = 0;
    prevBodyRoll = 0;
    prevFeetLocal = null;
    lastCycleX = 0;
    cycleAvgSpeed = 0;
    smoothedSpeed = 0;

    triggerUpdate();
}

document.getElementById('resetBtn').addEventListener('click', resetParameters);

// Buttons for Crank Holes
const holeYs = [15.2, 19.7, 24.2, 28.7];
const holeButtons = [];
for (let i = 1; i <= 4; i++) {
    const btn = document.getElementById(`crankHole${i}Btn`);
    if (btn) {
        holeButtons.push(btn);
        btn.addEventListener('click', () => {
            // UI Feedback
            holeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            currentCrankHoleY = holeYs[i - 1];
            R = crankDistances[i - 1];

            // 通知 AI 孔位變更 (R 變更)
            if (window.onSliderChanged) {
                window.onSliderChanged('crankHole', i);
            }

            paths = { near: { f: [], m: [], r: [] }, far: { f: [], m: [], r: [] } };
            triggerUpdate();
        });

    }
}

// --- AI Diagnostic Support ---
let hopYHistory = [];
let isClashing = false; // 全域衝突旗標
const MAX_ANALYTICS_WINDOW = 120; // 2 seconds at 60fps

/**
 * 萃取適合國小生的簡化指標
 */
export function getSimplifiedAnalytics() {
    const recentHops = hopYHistory.slice(-MAX_ANALYTICS_WINDOW);
    const hopRange = recentHops.length > 0 ? (Math.max(...recentHops) - Math.min(...recentHops)) : 0;

    // 使用正確的全域旗標判定
    const hasConflict = isClashing;

    let stability = "優";

    if (hasConflict) stability = "幾何衝突 (卡死)";
    else if (hopRange > 10) stability = "差";
    else if (hopRange > 5) stability = "普通";

    return {
        params: {
            legLength: Math.round(L_leg / globalScale),
            footLength: Math.round(L_foot / globalScale),
            blueLink: Math.round(L_blue / globalScale),
            bodyWidth: Math.round(S / globalScale),
            crankRadius: Math.round(R), // R 通常沒縮放，但取整較美觀
            phaseDiff: Math.round((phaseDiff / Math.PI) * 180),
            speed: Math.round(simSpeed * 10) / 10
        },

        physics: {
            hopRange: hasConflict ? "N/A" : hopRange.toFixed(1),
            stability: stability,
            hasConflict: hasConflict
        },
        isMoving: !hasConflict && Math.abs(simSpeed) > 0
    };
}



function recordAnalyticsData() {
    if (typeof hopY !== 'undefined') {
        hopYHistory.push(hopY);
        if (hopYHistory.length > MAX_ANALYTICS_WINDOW) hopYHistory.shift();
    }
}

// --- 監聽滑桿變動並通知 AI ---

// --- 監聽滑桿變動並通知 AI ---
const slidersToWatch = [
    'lLegSlider', 'lFootSlider', 'lBlueSlider', 'sSlider', 'gearboxShiftSlider', 'phaseSlider', 'simSpeedSlider', 'speedSlider'
];

slidersToWatch.forEach(id => {
    const slider = document.getElementById(id);
    if (slider) {
        // 改用 change 事件，放開滑鼠後才觸發 AI
        slider.addEventListener('change', () => {
            if (window.onSliderChanged) {
                window.onSliderChanged(id, slider.value);
            }
        });
    }
});


// 最後啟動循環
animate();

// 將需要全域存取的函數掛載到 window
window.getSimplifiedAnalytics = getSimplifiedAnalytics;



