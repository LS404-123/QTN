/**
 * Hexapod Simulator - Kinematics and Physics Logic
 */
import { rodSVGPath, gearboxSVGPath, crankSVGPath, motorSVGPath } from './svgs.js';
import { BGScroller } from './bg_scroll.js';
import { ChronoRecorder } from './chrono_recorder.js';

// Initialize ChronoRecorder with 5 frames per cycle (72 degrees)
const chronoRecorder = new ChronoRecorder(1120, 630, 5);
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
    triggerUpdate(); // 背景載入完成後，強制觸發渲染更新背景
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

// ==========================================
//  Admin Mode Controller
// ==========================================
const AdminController = {
    isActive: false,
    overlayAlpha: 0,
    fadeSpeed: 0.05,

    toggle() {
        this.isActive = !this.isActive;
        const panel = document.querySelector('.control-panel');
        if (panel) {
            panel.classList.toggle('admin-mode', this.isActive);
        }
        console.log("Admin Authority: " + (this.isActive ? "Enabled" : "Disabled"));
    },

    updateFade() {
        if (this.isActive) {
            this.overlayAlpha = Math.min(1, this.overlayAlpha + this.fadeSpeed);
        } else {
            this.overlayAlpha = Math.max(0, this.overlayAlpha - this.fadeSpeed);
        }
    },

    isAnimating(isPlaying, isSettled) {
        return isPlaying || !isSettled ||
            (this.isActive && this.overlayAlpha < 1) ||
            (!this.isActive && this.overlayAlpha > 0);
    },

    getStrokeColor() {
        return this.isActive ? '#000000' : 'transparent';
    }
};

let isSlowMo = false;
let showGroundline = true;
let showFriction = true;

let paths = { near: { f: [], m: [], r: [] }, far: { f: [], m: [], r: [] } };
const maxPathLen = 150;

let isLooping = false;
let playOnePeriod = false;
let accumulatedTheta = 0;

// 正向物理狀態變數
let bodyX = 0;
let prevBodyX = 0; // 追蹤上一幀的機身世界 X 座標，用於計算相對背景位移
let bodyY = 0; // 由觸地約束決定

// --- 攝影機與運鏡狀態 ---
let cameraX = 0;
let cameraVelX = 0;
let smoothBodyVelX = 0;
const camOmega = 12.0; // 臨界阻尼的響應頻率 (提高數值，避免落後太多頂到螢幕邊緣)
const camTrail = 0.05; // 刻意滯後的參數，保證攝影機永遠在機器人後方
let bodyRoll = 0; // 機身傾角 (弧度)
let bodyRollVel = 0;
let bodyVelX = 0; // 機身水平速度
let bodyMass = 0.5; // 機身質量
let footStiffness = 30; // 腳步剛度 K (N/mm)，已修正為合理的橡膠剛度
let footDamping = 0.4 * Math.sqrt(bodyMass / 10); // 腳步阻尼 C (N/(mm/s)) - 保持阻尼比固定，隨質量自動調整
let frictionCoeff = 0.8; // 摩擦係數 mu
// 儲存每隻腳的物理狀態，包含上幀位置、角度與累積滑動量
let footStates = Array.from({ length: 6 }, () => ({
    prevX: 0,
    prevRot: 0,
    slipDistance: 0,
    skid: 0,
    isGrounded: false,
    F_x: 0,
    F_max: 0,
    weight: 0
}));

const y_ground = 0; // 固定地面世界座標
let targetRoll = 0; // 當前目標傾角，用於物理收斂判定
let isStableSupport = false;
let lastGroundLineIndices = null; // 紀錄前一次選中的地面線腳掌索引，用於遲滯防抖
let lastGroundedIndices = []; // 追蹤觸地的腳掌索引


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
    // 加上 (bodyX - cameraX) 的攝影機相對位移，展現慣性與速度感
    return { x: cx + (bodyX - cameraX + rx) * scale, y: targetGy - ry * scale };
}

export function getIntersection(C1, r1, C2, r2) {
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



/**
 * 計算橢圓形腳部在給定地面斜率 m 下的最底端接觸點 (相對機器坐標系)
 * 幾何原理：基於橢圓的支撐函數 (Support Function) 與方向向量投影
 * 
 * @param {Object} P_top    腿部上端孔位 (由 FT/MT/RT 傳入)
 * @param {Object} P_bottom 腿部下端孔位 (由 Pf/ML/Pr 傳入)，即組件支點
 * @param {number} m        目前地面的斜率 (dy/dx)
 * @returns {Object}        橢圓腳部與地面碰撞的精確切點 {x, y}
 */
export function getEllipticFootPoint(P_top, P_bottom, m = 0) {
    const dx = P_bottom.x - P_top.x, dy = P_bottom.y - P_top.y;
    const L_curr = Math.sqrt(dx * dx + dy * dy);
    if (L_curr === 0) return P_bottom;

    const phi = Math.atan2(dy, dx);
    const rot = phi + Math.PI / 2;

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

    return { x: Cx + dx_cp, y: Cy + dy_cp, cx: Cx, cy: Cy, rot_local: rot };
}

export function getLegPositions(angle, groundM = 0) {
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
export function computeNormalForces(groundedIndices, allFeetLocal, roll) {
    if (groundedIndices.length === 0) return {};
    if (groundedIndices.length === 1) return { [groundedIndices[0]]: 1.0 };

    const cosR = Math.cos(roll);
    const sinR = Math.sin(roll);

    let feet = groundedIndices.map(idx => {
        const f = allFeetLocal[idx];
        return { idx, d: f.x * cosR - f.y * sinR };
    });

    feet.sort((a, b) => a.d - b.d);

    const left_d = feet[0].d;
    const right_d = feet[feet.length - 1].d;

    // 找出所有位於最左側與最右側的腳 (可能有多隻腳重疊)
    const leftFeet = feet.filter(f => Math.abs(f.d - left_d) < 1e-5);
    const rightFeet = feet.filter(f => Math.abs(f.d - right_d) < 1e-5);

    let weights = {};
    const minWeight = 0.15; // 保底權重，避免中腳 0% 打滑
    for (let idx of groundedIndices) weights[idx] = minWeight;

    const remainingWeight = 1.0 - (groundedIndices.length * minWeight);

    if (Math.abs(right_d - left_d) < 1e-5) {
        for (let idx of groundedIndices) weights[idx] += remainingWeight / groundedIndices.length;
    } else {
        let wL = right_d / (right_d - left_d);
        let wR = -left_d / (right_d - left_d);

        if (wL < 0) { wL = 0; wR = 1; }
        else if (wR < 0) { wL = 1; wR = 0; }

        // 如果有多隻腳位於同一個 X 座標，平分該側的權重
        for (let f of leftFeet) weights[f.idx] += (wL * remainingWeight) / leftFeet.length;
        for (let f of rightFeet) weights[f.idx] += (wR * remainingWeight) / rightFeet.length;
    }

    return weights;
}

/** 腳掌視為貼地的世界高度容差（極小浮點容差，無視覺緩衝） */
const CONTACT_TOL = 0.2;
/** 雙腳支撐對最小水平間距 */
const MIN_PAIR_DX = 2.0 * globalScale;
/** 機身最大傾角 */
const MAX_BODY_ROLL = Math.PI / 3;



/**
 * Main Render and Physics Logic Loop
 */
function renderFrame(currentTheta, recordPath, dt = 0.016) {
    try {
        if (dt === 0) dt = 0.016; // 確保暫停時拖動滑桿也能正常平滑演進
        // 1. 使用前一幀的地面斜率來預估腳尖位置，確保平滑度
        const m_prev = -Math.tan(bodyRoll);
        const near = getLegPositions(currentTheta, m_prev);
        const far = getLegPositions(currentTheta + phaseDiff, m_prev);

        // 更新幾何衝突狀態
        isClashing = (near === null || far === null);

        let deltaX = 0;
        let validLines = [];
        let invalidCOMLines = [];
        let groundLine = null;

        if (near && far) {
            const allFeetLocal = [
                near.foot_f, near.foot_m, near.foot_r,
                far.foot_f, far.foot_m, far.foot_r
            ];
            for (let i = 0; i < allFeetLocal.length; i++) {
                allFeetLocal[i].idx = i;
            }

            const cosR_body = Math.cos(bodyRoll);
            const sinR_body = Math.sin(bodyRoll);
            const rx_com = bodyYOffset * sinR_body;

            // 預先找出當前角度下的最低腳 (供單點支撐時使用)
            const y0_old = allFeetLocal.map(f => f.x * sinR_body + f.y * cosR_body);
            const lowestIdx = y0_old.indexOf(Math.min(...y0_old));

            // 2. 尋找凸包下邊緣切線作為地面線 (移植自 buffer/simulation.js 邏輯)
            validLines = [];
            invalidCOMLines = [];
            for (let i = 0; i < allFeetLocal.length; i++) {
                for (let j = i + 1; j < allFeetLocal.length; j++) {
                    let p1 = allFeetLocal[i], p2 = allFeetLocal[j];
                    let dx = p2.x - p1.x;
                    if (Math.abs(dx) < 0.01) continue;

                    let m = (p2.y - p1.y) / dx;
                    let c = p1.y - m * p1.x;

                    let allAbove = true;
                    for (let k = 0; k < allFeetLocal.length; k++) {
                        if (k === i || k === j) continue;
                        if (allFeetLocal[k].y < (m * allFeetLocal[k].x + c) - 0.2 * globalScale) {
                            allAbove = false;
                            break;
                        }
                    }

                    if (allAbove) {
                        // 計算如果將這條線貼平地面，所需的目標傾角
                        const targetRoll = -Math.atan(m);

                        const rx1 = p1.x * cosR_body - p1.y * sinR_body;
                        const rx2 = p2.x * cosR_body - p2.y * sinR_body;

                        let minX = Math.min(rx1, rx2);
                        let maxX = Math.max(rx1, rx2);

                        // 判斷當前重心是否橫跨此「真實世界支撐區間」
                        const comTolerance = S * 0.02; // 1% of total robot length (2 * S)
                        if (minX <= rx_com + comTolerance && maxX >= rx_com - comTolerance) {
                            // 計算當前重心在此區間內的「真實世界深度」
                            const depth = Math.min(rx_com - minX, maxX - rx_com);
                            validLines.push({ m, c, p1, p2, depth, targetRoll });
                        } else {
                            invalidCOMLines.push({ m, c, p1, p2 });
                        }
                    }
                }
            }

            groundLine = null;
            isStableSupport = false;

            // 預設為單點支撐的物理狀態 (純重力矩，無彈簧控制)
            let lowest = allFeetLocal[lowestIdx];
            let torque = (lowest.x * cosR_body - lowest.y * sinR_body) * 10.0 * gravityScale;
            let rollStiffness = 0;
            targetRoll = bodyRoll;

            if (validLines.length > 0) {
                // 遲滯防抖：如果前一次選中的地面線仍然合法，優先保留使用
                let prevLineStillValid = null;
                if (lastGroundLineIndices) {
                    prevLineStillValid = validLines.find(line =>
                        (line.p1.idx === lastGroundLineIndices.p1 && line.p2.idx === lastGroundLineIndices.p2) ||
                        (line.p2.idx === lastGroundLineIndices.p1 && line.p1.idx === lastGroundLineIndices.p2)
                    );
                }

                if (prevLineStillValid) {
                    groundLine = prevLineStillValid;
                } else {
                    // 若無舊線可用，選擇最接近當前機身傾角的合法線
                    groundLine = validLines.reduce((best, curr) => {
                        const bestDiff = Math.abs(best.targetRoll - bodyRoll);
                        const currDiff = Math.abs(curr.targetRoll - bodyRoll);
                        return currDiff < bestDiff ? curr : best;
                    }, validLines[0]);
                }

                // 記錄本次選中的腳掌索引對，並覆蓋為雙點支撐的物理狀態 (彈簧控制，無重力矩)
                lastGroundLineIndices = { p1: groundLine.p1.idx, p2: groundLine.p2.idx };
                isStableSupport = true;
                targetRoll = groundLine.targetRoll;
                rollStiffness = 700;
                torque = 0;
            } else {
                lastGroundLineIndices = null;
            }

            // 統一的姿態動力學更新 (Net angular acceleration = spring + torque - damping)
            const rollErr = targetRoll - bodyRoll;
            bodyRollVel += (rollErr * rollStiffness + torque - bodyRollVel * 40) * dt;
            bodyRoll += bodyRollVel * dt;

            // 以當前 roll 抬升機身，六腳皆不穿地；再依高度容差標記所有觸地腳
            const sinR_new = Math.sin(bodyRoll), cosR_new = Math.cos(bodyRoll);
            const y0 = allFeetLocal.map(f => f.x * sinR_new + f.y * cosR_new);
            const minY0 = Math.min(...y0);
            bodyY = -minY0;

            let groundedIndices = [];
            for (let k = 0; k < 6; k++) {
                if (y0[k] - minY0 <= CONTACT_TOL) {
                    groundedIndices.push(k);
                }
            }

            lastGroundedIndices = groundedIndices;

            // 3. 物理動力學位移積分：累積滑動法 (Slip Accumulation)
            if (groundedIndices.length > 0) {
                const weights = computeNormalForces(groundedIndices, allFeetLocal, bodyRoll);
                let totalForceX = 0;

                for (let i = 0; i < 6; i++) {
                    const state = footStates[i];
                    if (groundedIndices.includes(i)) {
                        const f = allFeetLocal[i];
                        // 計算腳掌中心的世界座標
                        const cosR = Math.cos(bodyRoll);
                        const sinR = Math.sin(bodyRoll);
                        const x_world = bodyX + (f.cx * cosR - f.cy * sinR);
                        const y_world = bodyY + (f.cx * sinR + f.cy * cosR);
                        const rot_world = f.rot_local + bodyRoll; // 腳掌絕對角度

                        if (!state.isGrounded) {
                            state.isGrounded = true;
                            state.slipDistance = 0;
                            state.skid = 0;
                            state.prevX = x_world;
                            state.prevRot = rot_world;
                        }

                        // 剛體運動學滑動增量 dx_slip = dx_center + dRot * y_center
                        const dx_center = x_world - state.prevX;
                        const dRot = rot_world - state.prevRot;
                        const dx_slip = dx_center + dRot * y_world;

                        state.slipDistance += dx_slip;

                        // 轉換為真實 mm (移除 globalScale 的放大效應)
                        const slip_real_mm = state.slipDistance / globalScale;
                        const slip_vel_real_mm = (dx_slip / globalScale) / dt;

                        // 計算彈簧剪切力 (嘗試抵抗滑動)，加入阻尼消除震盪
                        const spring_force = -footStiffness * slip_real_mm;
                        const damp_force = -footDamping * slip_vel_real_mm;

                        // 【數值穩定性保護】防止 Explicit Euler 積分在「低質量 + 高剛度」下產生跨越平衡點的來回震盪
                        // 計算單幀能讓系統剛好歸零的「臨界力 (m * a_critical)」
                        const m_eff = bodyMass * weights[i];
                        const max_F_spring = (m_eff * Math.abs(slip_real_mm) / (dt * dt)) / 1000;
                        const max_F_damp = (m_eff * Math.abs(slip_vel_real_mm) / dt) / 1000;

                        const clamped_spring = Math.sign(spring_force) * Math.min(Math.abs(spring_force), max_F_spring);
                        const clamped_damp = Math.sign(damp_force) * Math.min(Math.abs(damp_force), max_F_damp);

                        let F_x = clamped_spring + clamped_damp;

                        // 動態摩擦力上限 F_max = mu * F_N
                        const F_N = weights[i] * bodyMass * 9.8 * gravityScale;
                        const F_max = frictionCoeff * F_N;

                        if (Math.abs(F_x) > F_max && F_max > 0) {
                            F_x = Math.sign(F_x) * F_max;
                            // 拖移更新：限制最大彈性形變
                            let newSlip_real = -F_x / footStiffness;
                            let newSlip_scaled = newSlip_real * globalScale;
                            state.skid += Math.abs(state.slipDistance - newSlip_scaled);
                            state.slipDistance = newSlip_scaled;
                        }

                        totalForceX += F_x;
                        state.F_x = F_x;
                        state.F_max = F_max;
                        state.weight = weights[i];

                        state.prevX = x_world;
                        state.prevRot = rot_world;
                    } else {
                        state.isGrounded = false;
                        state.slipDistance = 0;
                        state.skid = 0;
                        state.F_x = 0;
                        state.F_max = 0;
                        state.weight = 0;
                    }
                }

                // 積分計算機身位置 (F = ma)
                // totalForceX / bodyMass 算出來是 m/s^2，乘 1000 轉為真實 mm/s^2，再乘 globalScale 轉為畫布坐標系的縮放 mm/s^2
                bodyVelX += (totalForceX / bodyMass) * 1000 * globalScale * dt;

                // 移除不物理的 0.85 假阻尼。
                // 真實物理中，速度由腳部幾何的拉扯自然限制。只保留 1% 作為細微的關節軸承/空氣摩擦阻力
                bodyVelX *= 0.99;

                prevBodyX = bodyX;
                bodyX += bodyVelX * dt;
                deltaX = (bodyX - prevBodyX) * scale;
            } else {
                // 如果完全騰空
                for (let i = 0; i < 6; i++) {
                    footStates[i].isGrounded = false;
                    footStates[i].slipDistance = 0;
                }
                bodyVelX *= 0.99; // 騰空時只受微小空氣阻力
                prevBodyX = bodyX;
                bodyX += bodyVelX * dt;
                deltaX = (bodyX - prevBodyX) * scale;
            }
        }

        // --- 攝影機運鏡動力學 (Game Camera Dynamics) ---
        // 1. 低通濾波處理瞬間速度 (過濾步伐產生的脈衝抖動)
        // 使用 EMA (Exponential Moving Average)
        const filterAlpha = 1.0 - Math.exp(-dt / 0.1);
        smoothBodyVelX += (bodyVelX - smoothBodyVelX) * filterAlpha;

        // 2. 計算目標 (Trailing Camera)
        // 為了展現機器的力量感，攝影機目標刻意落後於機器人 (減去速度向量)
        // 使用 smoothBodyVelX (像素/秒) * camTrail (秒) 來計算滯後距離
        let targetCamX = bodyX - (smoothBodyVelX * camTrail);

        // 3. 臨界阻尼系統計算 (Critically Damped Spring)
        let a_cam = (camOmega * camOmega) * (targetCamX - cameraX) - (2 * camOmega) * cameraVelX;
        cameraVelX += a_cam * dt;

        let prevCameraX = cameraX;
        cameraX += cameraVelX * dt;
        let deltaCamX = (cameraX - prevCameraX) * scale;

        // --- 開始繪製背景與機器人 ---
        const cx = canvas.width / 2;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 更新背景位移與渲染背景 (使用攝影機的位移，而非機器人剛性位移)
        background.update(deltaCamX);
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
            ctx.strokeStyle = AdminController.getStrokeColor(); // admin mode 顯示黑色，平常透明
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

            // --- 高亮著地足 (依據物理判定 lastGroundedIndices) ---
            if (AdminController.overlayAlpha > 0.01) {
                ctx.save();
                ctx.globalAlpha = AdminController.overlayAlpha;
                for (let i = 0; i < 6; i++) {
                    if (lastGroundedIndices.includes(i)) {
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

                // --- 繪製重心 (COM) 與支撐分析指示器 ---
                if (showGroundline) {
                    // 重心在機身局部坐標系中位於 (0, -bodyYOffset)
                    const comLocal = { x: 0, y: -bodyYOffset };
                    const m_com = mapCoords(comLocal);

                    // 決定線條顏色 (若有合法兩點支撐，畫綠色；若退化為單點，畫紅色)
                    const isSinglePoint = (validLines.length === 0);
                    const indicatorColor = isSinglePoint ? '#ef4444' : '#10b981';

                    // 畫投影虛線到地面 (targetGy)
                    ctx.beginPath();
                    ctx.setLineDash([4, 4]);
                    ctx.moveTo(m_com.x, m_com.y);
                    ctx.lineTo(m_com.x, targetGy);
                    ctx.strokeStyle = indicatorColor;
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                    ctx.setLineDash([]);

                    // 在地面上標示投影點
                    ctx.beginPath();
                    ctx.arc(m_com.x, targetGy, 4, 0, Math.PI * 2);
                    ctx.fillStyle = indicatorColor;
                    ctx.fill();

                    // 畫 COM 符號 (黃黑相間)
                    const comRadius = 8;
                    ctx.save();
                    ctx.translate(m_com.x, m_com.y);
                    ctx.beginPath();
                    ctx.arc(0, 0, comRadius, 0, Math.PI * 2);
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                    for (let i = 0; i < 4; i++) {
                        ctx.beginPath();
                        ctx.moveTo(0, 0);
                        ctx.arc(0, 0, comRadius, i * Math.PI / 2, (i + 1) * Math.PI / 2);
                        ctx.closePath();
                        ctx.fillStyle = (i === 0 || i === 2) ? '#facc15' : '#0f172a';
                        ctx.fill();
                        ctx.stroke();
                    }
                    ctx.restore();

                    // 標註 COM 文字與 X 座標
                    const rx_com = bodyYOffset * Math.sin(bodyRoll);
                    const comX_unit = rx_com / globalScale;
                    ctx.fillStyle = '#0f172a';
                    ctx.font = 'bold 11px system-ui';
                    ctx.textAlign = 'center';
                    ctx.fillText(`COM (x: ${comX_unit.toFixed(2)})`, m_com.x, m_com.y - 12);

                    // 標註中間腳切點的 X 座標
                    const rx_near_m = near.foot_m.x * Math.cos(bodyRoll) - near.foot_m.y * Math.sin(bodyRoll);
                    const near_m_x = rx_near_m / globalScale;
                    const mp_near_m = mapCoords(near.foot_m);
                    ctx.fillStyle = '#b45309';
                    ctx.font = 'bold 10px system-ui';
                    ctx.textAlign = 'center';
                    ctx.fillText(`Near M (x: ${near_m_x.toFixed(2)})`, mp_near_m.x, mp_near_m.y + 15);

                    const rx_far_m = far.foot_m.x * Math.cos(bodyRoll) - far.foot_m.y * Math.sin(bodyRoll);
                    const far_m_x = rx_far_m / globalScale;
                    const mp_far_m = mapCoords(far.foot_m);
                    ctx.fillStyle = '#475569';
                    ctx.font = 'bold 10px system-ui';
                    ctx.textAlign = 'center';
                    ctx.fillText(`Far M (x: ${far_m_x.toFixed(2)})`, mp_far_m.x, mp_far_m.y - 12);

                    // 繪製支撐區間 (Support Range / Base) 幾何指示
                    if (groundLine) {
                        const mp1 = mapCoords(groundLine.p1);
                        const mp2 = mapCoords(groundLine.p2);
                        const minX = Math.min(mp1.x, mp2.x);
                        const maxX = Math.max(mp1.x, mp2.x);

                        // 在地面上畫出綠色支撐線段
                        ctx.beginPath();
                        ctx.moveTo(minX, targetGy);
                        ctx.lineTo(maxX, targetGy);
                        ctx.strokeStyle = '#10b981';
                        ctx.lineWidth = 6;
                        ctx.lineCap = 'round';
                        ctx.stroke();

                        // 標示 "Support Base" 文字
                        ctx.fillStyle = '#10b981';
                        ctx.font = 'bold 11px system-ui';
                        ctx.textAlign = 'center';
                        const midX = (minX + maxX) / 2;
                        ctx.fillText('支撐區間 (包含 COM)', midX, targetGy + 15);
                    } else {
                        // 單點支撐狀態：畫出被排除的兩點線 (invalidCOMLines)
                        invalidCOMLines.forEach((line) => {
                            const mp1 = mapCoords(line.p1);
                            const mp2 = mapCoords(line.p2);

                            // 畫紅色虛線段，表示被排除的支撐區間
                            ctx.beginPath();
                            ctx.moveTo(mp1.x, targetGy);
                            ctx.lineTo(mp2.x, targetGy);
                            ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
                            ctx.lineWidth = 4;
                            ctx.stroke();

                            // 在地面投影端點畫小紅點
                            ctx.beginPath();
                            ctx.arc(mp1.x, targetGy, 3, 0, Math.PI * 2);
                            ctx.fillStyle = '#ef4444';
                            ctx.fill();
                            ctx.beginPath();
                            ctx.arc(mp2.x, targetGy, 3, 0, Math.PI * 2);
                            ctx.fillStyle = '#ef4444';
                            ctx.fill();
                        });

                        // 指示為什麼是單點支撐的警示文字
                        ctx.fillStyle = '#ef4444';
                        ctx.font = 'bold 11px system-ui';
                        ctx.textAlign = 'center';
                        ctx.fillText('重心未落在任何兩點支撐區間內！', m_com.x, targetGy + 15);
                        ctx.font = '10px system-ui';
                        ctx.fillText('-> 強制退化為單點支撐 (幾何最低點)', m_com.x, targetGy + 28);
                    }
                }

                // --- 繪製動態物理指示器 ---
                if (showFriction) {
                    for (let i = 0; i < 6; i++) {
                        const state = footStates[i];
                        const f_local = allFeetLocal[i];
                        const mp = mapCoords(f_local);
                        // 遠側腳 (i >= 3) 的指示器移到機身上方，避免與近側腳重疊
                        const yOff = (i >= 3) ? 180 : 45;

                        let mainColor;
                        let dispF = 0, dispMax = 0, dispSlip = 0, dispW = 0, dispSkid = 0;

                        if (state.isGrounded) {
                            const isSlipping = Math.abs(state.F_x) >= state.F_max * 0.99 && state.F_max > 0;
                            mainColor = isSlipping ? '#ef4444' : '#3b82f6'; // 打滑紅，抓地藍
                            dispF = Math.abs(state.F_x);
                            dispMax = state.F_max;
                            dispSlip = state.slipDistance;
                            dispSkid = state.skid;
                            dispW = state.weight * 100;
                        } else {
                            mainColor = 'rgba(148, 163, 184, 0.5)'; // 騰空狀態：半透明灰
                        }

                        // 繪製摩擦力箭頭 (僅觸地且有施力時)
                        if (state.isGrounded) {
                            // 動態計算視覺縮放比例，確保在不同質量下都能清楚看到長度差異
                            const visualScale = 15.0; // 力轉為像素的縮放比例
                            const forceVec = state.F_x * visualScale;

                            if (Math.abs(forceVec) > 1) {
                                ctx.beginPath();
                                ctx.moveTo(mp.x, mp.y - yOff);
                                ctx.lineTo(mp.x + forceVec, mp.y - yOff);
                                ctx.strokeStyle = mainColor;
                                ctx.lineWidth = 3;
                                ctx.stroke();

                                ctx.beginPath();
                                ctx.arc(mp.x + forceVec, mp.y - yOff, 4, 0, Math.PI * 2);
                                ctx.fillStyle = mainColor;
                                ctx.fill();
                            }
                        }

                        // 標示物理數據文字
                        ctx.fillStyle = mainColor;
                        ctx.font = 'bold 11px system-ui';
                        ctx.textAlign = 'center';

                        // 第1行：摩擦力 / 最大摩擦力
                        ctx.fillText(`F: ${dispF.toFixed(1)} / Max: ${dispMax.toFixed(1)}`, mp.x, mp.y - yOff - 35);
                        // 第2行：滑動變形量 / 變形極限 | 法向力權重
                        const maxSlipLimit = state.isGrounded ? (state.F_max / footStiffness) : 0;
                        ctx.fillText(`Def: ${Math.abs(dispSlip).toFixed(2)}/${maxSlipLimit.toFixed(2)} | W: ${dispW.toFixed(0)}%`, mp.x, mp.y - yOff - 22);
                        // 第3行：總計真實打滑距離
                        ctx.fillText(`Skid: ${dispSkid.toFixed(2)}`, mp.x, mp.y - yOff - 9);
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
        if (AdminController.overlayAlpha > 0.01) {
            ctx.save();
            ctx.globalAlpha = AdminController.overlayAlpha;
            drawOverlayStats();
            ctx.restore();
        }

        // 紀錄數據用於 AI 診斷
        if (typeof recordAnalyticsData === 'function') {
            recordAnalyticsData();
        }

        // Live Trailing Capture Hook for Chronophotography
        if (chronoRecorder.isRecording) {
            chronoRecorder.captureFrameHook(currentTheta, robotCanvas, cameraX, scale);
        }
    } catch (err) {
        console.error("Render error in hexapod sim:", err);
        ctx.save();
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 16px system-ui';
        ctx.fillText("Render Error: " + err.message, 20, 40);
        ctx.restore();
    } finally {
        ctx.globalAlpha = 1.0;
    }
}


function drawOverlayStats() {
    const w = 260;
    const h = 205; // 縮小面板高度，因為我們移除了多餘的速度顯示
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

    // 只顯示最穩定且具備比較價值的「週期平均速度」
    // 這個數值代表機器人每走完完整一步的真實平均推進能力，不會隨步伐抖動，最適合用來比較不同連桿長度的效能
    drawRow('每圈前進距離:', `${displayDist.toFixed(1)} mm`, '#38bdf8', y + 68);
    drawRow('每秒前進速度:', `${displaySpeed.toFixed(1)} mm/s`, '#34d399', y + 93);
    drawRow('地面支撐狀態:', isStableSupport ? '穩定支撐' : '失去平衡', isStableSupport ? '#10b981' : '#ef4444', y + 118);

    // 5. Grounded Foot Indicators
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px system-ui';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('觸地狀態 (綠:觸地/灰:懸空)', x + 20, y + 142);

    const startY = y + 162;
    const startY2 = y + 182;

    const drawIndicator = (idx, label, px, py) => {
        const isGrounded = lastGroundedIndices.includes(idx);
        ctx.beginPath();
        ctx.arc(px, py, 7, 0, Math.PI * 2);
        ctx.fillStyle = isGrounded ? '#10b981' : '#475569';
        ctx.fill();

        ctx.textAlign = 'center';
        ctx.font = 'bold 9px system-ui';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, px, py + 3);
    };

    ctx.textAlign = 'left';
    ctx.font = '11px system-ui';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('遠端 Far', x + 20, startY + 3);
    drawIndicator(3, 'F', x + 100, startY);
    drawIndicator(4, 'M', x + 140, startY);
    drawIndicator(5, 'R', x + 180, startY);

    ctx.textAlign = 'left';
    ctx.font = '11px system-ui';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('近端 Near', x + 20, startY2 + 3);
    drawIndicator(0, 'F', x + 100, startY2);
    drawIndicator(1, 'M', x + 140, startY2);
    drawIndicator(2, 'R', x + 180, startY2);
}

function animate() {
    let now = performance.now();
    let dt = (now - lastFrameTime) / 1000;
    dt = Math.min(0.03, dt); // 限制單幀最大物理步長，防後台切換爆炸
    lastFrameTime = now;

    const factor = isSlowMo ? 0.2 : 1.0;
    const simDt = dt * factor;

    if (isPlaying) {
        // 確保參數化 SVG 在最初幾幀能成功覆蓋 svgs.js 的非同步加載結果
        if (globalSimTime < 1.0) updateLegSVGPath();

        theta += simSpeed * factor;
        globalSimTime += simDt;

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

                // 將畫布座標系的數據轉換為物理單位 (mm) 並更新給 UI 顯示
                displaySpeed = cycleAvgSpeed / globalScale;
                displayDist = dx / globalScale;
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

    renderFrame(theta, isPlaying, simDt);

    const isSettled = !isPlaying && Math.abs(bodyRollVel) < 1e-4 && Math.abs(targetRoll - bodyRoll) < 1e-4;
    if (AdminController.isAnimating(isPlaying, isSettled)) {
        isLooping = true;
        requestAnimationFrame(animate);
    } else {
        isLooping = false;
        renderFrame(theta, false, 0); // Final render to update UI
    }

    // Update overlay Alpha for smooth fade
    AdminController.updateFade();

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

document.getElementById('toggleGroundlineBtn').addEventListener('click', (e) => {
    showGroundline = !showGroundline;
    e.target.classList.toggle('active', showGroundline);
    triggerUpdate();
});

document.getElementById('toggleFrictionBtn').addEventListener('click', (e) => {
    showFriction = !showFriction;
    e.target.classList.toggle('active', showFriction);
    triggerUpdate();
});

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

// --- Hidden Admin Trigger (Triple-click on "觀察中" in AI chat box) ---
let clickCount = 0;
let lastClickTime = 0;
const aiStatusEl = document.querySelector('.ai-status');
if (aiStatusEl) {
    aiStatusEl.style.cursor = 'pointer'; // Ensure cursor feedback on hover
    aiStatusEl.addEventListener('click', () => {
        const now = Date.now();
        if (now - lastClickTime < 600) {
            clickCount++;
        } else {
            clickCount = 1;
        }
        lastClickTime = now;

        if (clickCount >= 3) {
            AdminController.toggle();
            clickCount = 0; // Reset
            triggerUpdate(); // Refresh to show/hide overlay
        }
    });
}



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
    for (let i = 0; i < 6; i++) footStates[i].isGrounded = false;
    triggerUpdate();
});

const setupSlider = (id, valId, callback) => {
    document.getElementById(id).addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById(valId).innerText = val;
        callback(val * globalScale); // Apply globalScale here
        paths = { near: { f: [], m: [], r: [] }, far: { f: [], m: [], r: [] } };
        for (let i = 0; i < 6; i++) footStates[i].isGrounded = false;
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
    bodyVelX = 0;
    for (let i = 0; i < 6; i++) footStates[i].isGrounded = false;
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
    
    // 取出最新的全域物理狀態
    const hasConflict = isClashing;
    const currentSpeed = (typeof displaySpeed !== 'undefined') ? parseFloat(displaySpeed.toFixed(1)) : 0;
    const isStable = (typeof isStableSupport !== 'undefined') ? isStableSupport : true;

    // 產生診斷標籤
    let tags = [];
    if (hasConflict) {
        tags.push("急診-卡死");
    } else {
        if (!isStable) tags.push("骨科-失去平衡跌倒");
        if (currentSpeed < 5) tags.push("復健科-速度過慢或原地打滑");
        else if (currentSpeed > 15 && hopRange > 5) tags.push("健康保健-速度快但顛簸");
        else if (currentSpeed > 10 && isStable && hopRange <= 5) tags.push("健康保健-完美步伐");
    }

    return {
        symptom: {
            isClashing: hasConflict,
            isStable: isStable,
            hopRange: hasConflict ? 0 : parseFloat(hopRange.toFixed(1)),
            speed: currentSpeed
        },
        diagnosis_tags: tags,
        params: {
            legLength: Math.round(L_leg / globalScale),
            footLength: Math.round(L_foot / globalScale),
            blueLink: Math.round(L_blue / globalScale),
            bodyWidth: Math.round(S / globalScale),
            crankRadius: Math.round(R),
            phaseDiff: Math.round((phaseDiff / Math.PI) * 180)
        }
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
window.getIsPlaying = () => isPlaying;
window.startChronoRecording = (paramsJson) => {
    const promise = chronoRecorder.start(paramsJson, cameraX, theta, isPlaying);
    // Force the first frame capture immediately if recording just started
    if (chronoRecorder.isRecording) {
        chronoRecorder.doCapture(robotCanvas, cameraX, scale);
    }
    return promise;
};



