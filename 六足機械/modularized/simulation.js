/**
 * Hexapod Simulator - Kinematics and Physics Logic
 */
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
let L_foot = 25.0 * (41.54 / 45) * globalScale; // 鎖定與 SVG 的幾何比例 (腳尖:支點) = 41.54:45
let gearboxShiftX = 0;

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
// Keep ground line fixed at roughly 480px down (near bottom of 500px canvas)
const targetGy = 480;
const cy = targetGy + groundY_Ideal * scale;

function updateCrankPosition() {
    const bodyDistancePx = bodyYOffset * scale;
    const barThicknessPx = 12;
    const targetDistPx = bodyDistancePx - (barThicknessPx / 2.0);
    const customGearboxScale = targetDistPx / 12.5; // distance from hole (cy=12.5) to bottom (cy=25)

    // Bottom tab is at x=18.5, crank hole is at x=25 (difference = 6.5)
    C_crank.x = gearboxShiftX + (6.5 * customGearboxScale / scale);
    C_crank.y = -bodyYOffset + 2 + (12.5 * customGearboxScale / scale);
}

// Initial calculation
updateCrankPosition();

let theta = 0;
let phaseDiff = 0; // 相位差預設 0 度 (User requested)
let isPlaying = true;
let showPaths = false;
let simSpeed = -0.1;
let gravityScale = 1.0;
let povMode = 'world';
let isAdminMode = false; // Hidden Admin Authority
let overlayAlpha = 0;   // For smooth fade in/out

let paths = { near: { f: [], m: [], r: [] }, far: { f: [], m: [], r: [] } };
const maxPathLen = 150;

let isLooping = false;
let playOnePeriod = false;
let accumulatedTheta = 0;

// Physics State
let smoothedGround = { m: 0, c: groundY_Ideal };
let prevM = 0; // Track previous ground slope for movement projection
let angularVel = 0;
let isTorqueMode = false;
let lockedPivot = null;
let lockedPivotIndex = -1;

// --- Distance & Speed Tracking Variables ---
// Physics & Inertia State
let jitterX = 0;
let jitterY = 0;
let jitterM = 0; // Tilt jitter
let lastFrameTime = performance.now();
let globalSimTime = 0; // Total accumulated simulation time
let prevFeet = null;
let prevGroundedFeetIndices = [];
let currentWorldX = 0;

// Per-foot tracking to precisely measure ground-contact duration and distance
let footTracking = Array(6).fill(null).map(() => ({ isGrounded: false, startX: 0, startTime: 0 }));

let displayDist = 0;
let displayTime = 0;
let displaySpeed = 0;
let smoothedSpeed = 0; // Real-time horizontal velocity (px/s) with EMA smoothing
let cycleAvgSpeed = 0;  // Average speed over the last full crank cycle
let lastCycleX = 0;
let lastCycleTime = 0;
let prevTheta = 0;

// --- Speed Visualization State ---
class SpeedParticle {
    constructor() {
        this.vx = 0; // Current internal velocity for inertia/decay
        this.reset();
    }
    reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * (canvas.height - 50); // across full height
        this.len = 15 + Math.random() * 40;
        this.speedMult = (0.8 + Math.random() * 0.4) * speedVizConfig.particleSpeedMult;
        this.opacity = (Math.random() * 0.4 + 0.2) * speedVizConfig.particleBaseOpacity;
        // Don't reset vx, keep momentum during screen wrap
    }
    update(dt, speed) {
        // Target velocity based on robot movement
        const targetVx = speed * scale * this.speedMult;

        // --- Decay / Smoothing Term (Inertia) ---
        // Every frame, current velocity drifts 10% towards target velocity
        const smoothing = 0.05;
        this.vx = this.vx * (1 - smoothing) + targetVx * smoothing;

        this.x -= this.vx * dt;

        if (this.x < -100) {
            this.x = canvas.width + 100;
            this.y = Math.random() * (canvas.height - 50);
        } else if (this.x > canvas.width + 100) {
            this.x = -100;
            this.y = Math.random() * (canvas.height - 50);
        }
    }
    draw(ctx, speed) {
        const dynamicLen = this.len + Math.abs(speed * scale) * speedVizConfig.particleLengthScale;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        // Draw tail based on direction
        ctx.lineTo(this.x + (speed >= 0 ? dynamicLen : -dynamicLen), this.y);
        ctx.strokeStyle = `rgba(30, 58, 138, ${this.opacity})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
}

class Particle {
    constructor() {
        this.reset(true);
    }
    reset(initial = false) {
        this.x = initial ? Math.random() * canvas.width : (Math.random() > 0.5 ? canvas.width + 10 : -10);
        this.y = 480 + Math.random() * 80;
        this.opacity = 0.1 + Math.random() * 0.3;
        this.len = 5 + Math.random() * 15;
    }
    update(dt, speed) {
        const targetVx = speed * scale;
        this.x -= targetVx * dt;
        if (this.x < -100 || this.x > canvas.width + 100) {
            this.reset();
        }
    }
    draw(ctx, speed) {
        const dynamicLen = this.len * (1 + Math.abs(speed) / 50);
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + (speed >= 0 ? dynamicLen : -dynamicLen), this.y);
        ctx.strokeStyle = `rgba(30, 58, 138, ${this.opacity})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
    }
}

class Tree {
    constructor() {
        this.reset(true);
    }
    reset(initial = false) {
        const types = ['pine', 'round', 'poplar'];
        this.type = types[Math.floor(Math.random() * 3)];
        this.x = initial ? Math.random() * (canvas.width + 600) - 300 : (Math.random() > 0.5 ? canvas.width + 300 : -300);
        
        // Depth-linked parameters (smaller = further)
        this.scale = 0.4 + Math.random() * 0.8; // Range [0.4, 1.2]
        // Opacity: map scale [0.4, 1.2] to opacity [0.3, 0.8]
        this.opacity = (this.scale - 0.4) / 0.8 * 0.5 + 0.3;
        this.y = 480; 
    }
    update(dt, speed) {
        // Parallax speed: smaller trees (far away) move slower
        // Normalized so that trees with scale 1.2 move at 100% ground speed
        const parallaxFactor = this.scale / 1.2;
        const targetVx = speed * scale * parallaxFactor;
        this.x -= targetVx * dt;

        if (this.x < -400) {
            this.x = canvas.width + 400;
            this.reset(false);
        } else if (this.x > canvas.width + 400) {
            this.x = -400;
            this.reset(false);
        }
    }
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y - 20 * this.scale);
        ctx.scale(this.scale, this.scale);
        ctx.globalAlpha = this.opacity;
        
        const green = '#a7f3d0';
        const brown = '#94a3b8';

        if (this.type === 'pine') {
            ctx.beginPath(); ctx.moveTo(0, -110);
            ctx.bezierCurveTo(15, -85, 30, -75, 10, -65); ctx.bezierCurveTo(30, -55, 45, -35, 20, -30);
            ctx.bezierCurveTo(45, -20, 60, 10, 0, 10); ctx.bezierCurveTo(-60, 10, -45, -20, -20, -30);
            ctx.bezierCurveTo(-45, -35, -30, -55, -10, -65); ctx.bezierCurveTo(-30, -75, -15, -85, 0, -110);
            ctx.closePath(); ctx.fillStyle = green; ctx.fill(); ctx.strokeStyle = brown; ctx.lineWidth = 3; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, -70); ctx.moveTo(0, -10); ctx.lineTo(-20, -15); ctx.moveTo(0, -10); ctx.lineTo(20, -15); ctx.stroke();
        } else if (this.type === 'round') {
            ctx.beginPath(); ctx.moveTo(0, -100); ctx.bezierCurveTo(20, -105, 40, -80, 40, -55);
            ctx.bezierCurveTo(55, -40, 50, -10, 25, -5); ctx.bezierCurveTo(15, 5, -15, 5, -25, -5);
            ctx.bezierCurveTo(-50, -10, -55, -40, -40, -55); ctx.bezierCurveTo(-40, -80, -20, -105, 0, -100);
            ctx.closePath(); ctx.fillStyle = green; ctx.fill(); ctx.strokeStyle = brown; ctx.lineWidth = 3; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -70); ctx.moveTo(0, -20); ctx.lineTo(-20, -40); ctx.moveTo(0, -30); ctx.lineTo(25, -45); ctx.stroke();
        } else {
            ctx.beginPath(); ctx.moveTo(0, -105); ctx.bezierCurveTo(15, -105, 25, -90, 15, -75);
            ctx.bezierCurveTo(30, -70, 40, -50, 25, -35); ctx.bezierCurveTo(45, -30, 45, 0, 0, 0);
            ctx.bezierCurveTo(-45, 0, -45, -30, -25, -35); ctx.bezierCurveTo(-40, -50, -30, -70, -15, -75);
            ctx.bezierCurveTo(-25, -90, -15, -105, 0, -100);
            ctx.closePath(); ctx.fillStyle = green; ctx.fill(); ctx.strokeStyle = brown; ctx.lineWidth = 3; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -75); ctx.moveTo(0, -25); ctx.lineTo(-15, -45); ctx.moveTo(0, -40); ctx.lineTo(15, -55); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(-20, 20); ctx.lineTo(20, 20); ctx.moveTo(0, 0); ctx.lineTo(0, 20); ctx.stroke();
        ctx.restore();
    }
}

// Global scenic objects
const particles = Array.from({ length: 40 }, () => new Particle());
const trees = Array.from({ length: 6 }, () => new Tree());
let speedParticles = Array.from({ length: speedVizConfig.particleCount }, () => new SpeedParticle());

// Viewport Settings (Moved to top to prevent ReferenceError)

/**
 * Transforms internal coordinates to screen space based on Camera POV
 */
function mapCoords(p) {
    let rx = p.x;
    let ry = p.y;

    if (povMode === 'world') {
        let tiltRad = -Math.atan(smoothedGround.m + jitterM); // Apply jitter to tilt
        const cosT = Math.cos(tiltRad);
        const sinT = Math.sin(tiltRad);

        let tempX = (p.x + jitterX) * cosT - (p.y + jitterY) * sinT; // Apply jitter x, y
        let tempY = (p.x + jitterX) * sinT + (p.y + jitterY) * cosT;
        let finalShiftY = (smoothedGround.c * cosT) - groundY_Ideal;

        rx = tempX;
        ry = tempY - finalShiftY;
    }

    return { x: cx + rx * scale, y: cy - ry * scale };
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
    // 1. 計算腿部向量與當前物理長度
    const dx = P_bottom.x - P_top.x, dy = P_bottom.y - P_top.y;
    const L_curr = Math.sqrt(dx * dx + dy * dy);
    if (L_curr === 0) return P_bottom;

    // 2. 確定腿部旋轉角度 (phi 為世界坐標夾角)
    const phi = Math.atan2(dy, dx);
    const rot = phi - Math.PI / 2; // 計算橢圓局部坐標系與世界座標系的旋轉差

    // 3. 根據 L_leg 與 SVG 原始設計 (45mm 孔距) 進行比例縮放
    const s = L_curr / 45.0;            // 幾何縮放因子
    const a = 25 * s;                   // 橢圓長軸半徑 (對應 SVG 的 rx=25)
    const b = 13 * s;                   // 橢圓短軸半徑 (對應 SVG 的 ry=13)
    const centerDist = 28.54 * s;       // 支點 P_bottom 到橢圓幾何中心的精確偏移 (根據高度 15.37mm 標定)

    // 4. 在世界坐標系中定位橢圓中心的坐標 (Cx, Cy)
    const Cx = P_bottom.x + (dx / L_curr) * centerDist;
    const Cy = P_bottom.y + (dy / L_curr) * centerDist;

    // 5. 計算地面法線在橢圓局部坐標系中的投影分量
    // 地面法線向量 n = (-m, 1)，我們將其旋轉至橢圓局部軸向 u, v
    const sinR = Math.sin(rot), cosR = Math.cos(rot);
    const n_u = sinR - m * cosR;        // 法線在橢圓長軸方向的投影
    const n_v = cosR + m * sinR;        // 法線在橢圓短軸方向的投影

    // 6. 計算橢圓中心到切線的垂直距離 h (即該方向的支撐半徑)
    const h = Math.sqrt(a * a * n_u * n_u + b * b * n_v * n_v);

    // 7. 計算橢圓「頂部」切點相對於中心的世界坐標位移
    // 根據橢圓性質，法線為 (n_u, n_v) 的點坐標與 (a^2*n_u, b^2*n_v) 成正比
    const dx_rel_top = (a * a * n_u * cosR - b * b * n_v * sinR) / h;
    const dy_rel_top = (a * a * n_u * sinR + b * b * n_v * cosR) / h;

    // 8. 鏡像轉換以獲得「底部」實際地面接觸點
    // 由於我們需要的是地面接觸點而非頂部切點，需取鏡像反向向量
    const dx_cp = -dx_rel_top;
    const dy_cp = -dy_rel_top;

    // 回傳包含水平與垂直校正後的最終接觸點位置
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
    if (!p1 || !p2) return;
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

function drawPath(pathArray, color, dash) {
    if (!showPaths || pathArray.length < 2) return;
    ctx.beginPath();
    const start = mapCoords(pathArray[0]);
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i < pathArray.length; i++) {
        const pt = mapCoords(pathArray[i]);
        ctx.lineTo(pt.x, pt.y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    if (dash) ctx.setLineDash(dash);
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawPoint(p, color, radius, targetCtx = ctx) {
    const mp = mapCoords(p);
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
        drawSVGLink(data.FT, Pf, legSVGPath, 30, 20, 30, 65, legStroke, legFill, isFar, targetCtx);
        drawSVGLink(data.MT, data.ML, legSVGPath, 30, 20, 30, 65, legStroke, legFill, isFar, targetCtx);
        drawSVGLink(data.RT, Pr, legSVGPath, 30, 20, 30, 65, legStroke, legFill, isFar, targetCtx);
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
 * Main Render and Physics Logic Loop
 */
function renderFrame(currentTheta, recordPath, dt = 0.016) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 0. Draw Speed Particles (Bottom Layer) - Driven by stable cycle average
    speedParticles.forEach(p => p.draw(ctx, cycleAvgSpeed));

    // Draw Scenic Trees & Ground Particles
    trees.forEach(t => t.draw(ctx));
    particles.forEach(p => p.draw(ctx, cycleAvgSpeed));


    // Clear off-screen buffer
    offCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

    // 使用前一幀的地面斜率來預估腳尖位置，確保平滑度
    const near = getLegPositions(currentTheta, smoothedGround.m);
    const far = getLegPositions(currentTheta + phaseDiff, smoothedGround.m);

    if (near && far) {
        const allFeet = [
            near.foot_f, near.foot_m, near.foot_r,
            far.foot_f, far.foot_m, far.foot_r
        ];

        // 2. Determine Static Ground Plane
        let validLines = [];
        for (let i = 0; i < allFeet.length; i++) {
            for (let j = i + 1; j < allFeet.length; j++) {
                let p1 = allFeet[i], p2 = allFeet[j];
                let dx = p2.x - p1.x;
                if (Math.abs(dx) < 0.01) continue;

                let m = (p2.y - p1.y) / dx;
                let c = p1.y - m * p1.x;

                let allAbove = true;
                for (let k = 0; k < allFeet.length; k++) {
                    if (k === i || k === j) continue;
                    if (allFeet[k].y < (m * allFeet[k].x + c) - 0.2) {
                        allAbove = false; break;
                    }
                }

                if (allAbove) {
                    let minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
                    if (minX <= 2.0 && maxX >= -2.0) validLines.push({ m, c, p1, p2 });
                }
            }
        }

        let groundLine;
        if (validLines.length > 0) {
            groundLine = validLines[0];
        } else {
            let lowest = allFeet.reduce((min, p) => p.y < min.y ? p : min, allFeet[0]);
            groundLine = { m: 0, c: lowest.y, p1: lowest, p2: lowest };
        }

        // 3. Update Physics (Tipping Dynamics)
        const targetM = groundLine.m;
        const targetC = groundLine.c;
        const diffM = targetM - smoothedGround.m;

        if (!isTorqueMode) {
            if (Math.abs(diffM) > 0.04) {
                isTorqueMode = true;
                let pivotObj = Math.abs(groundLine.p1.x) < Math.abs(groundLine.p2.x) ? groundLine.p1 : groundLine.p2;
                lockedPivotIndex = allFeet.indexOf(pivotObj);
                lockedPivot = allFeet[lockedPivotIndex];
            } else {
                smoothedGround.m = targetM;
                smoothedGround.c = targetC;
            }
        }

        if (isTorqueMode) {
            if (lockedPivotIndex !== -1) lockedPivot = allFeet[lockedPivotIndex];

            let damping = 0.94, stiffness = 0.008 * gravityScale;
            angularVel += diffM * stiffness;
            angularVel *= damping;

            let oldM = smoothedGround.m;
            smoothedGround.m += angularVel;
            smoothedGround.c = lockedPivot.y - (smoothedGround.m * lockedPivot.x);

            const hasOvershot = (targetM > oldM) ? (smoothedGround.m > targetM) : (smoothedGround.m < targetM);
            const feetClash = allFeet.some(f => f.y < (smoothedGround.m * f.x + smoothedGround.c - 0.8));

            if (hasOvershot || feetClash || Math.abs(angularVel) < 0.0001) {
                isTorqueMode = false;
                lockedPivotIndex = -1;
                smoothedGround.m = targetM;
                smoothedGround.c = targetC;
                angularVel = 0;
            }
        }

        // 4. Movement Distance Tracking (追蹤地面支點的相對位移)
        let frameDx = 0;
        let currentGroundedFeetIndices = [];

        // 獨立判斷哪些腳目前在地上 (寬鬆觸地判定，容許 1.0 誤差)
        for (let i = 0; i < allFeet.length; i++) {
            let f = allFeet[i];
            let expectedY = smoothedGround.m * f.x + smoothedGround.c;
            if (Math.abs(f.y - expectedY) < 1.0) {
                currentGroundedFeetIndices.push(i);
            }
        }

        if (prevFeet) {
            const getWX = (p, m) => {
                const alpha = -Math.atan(m);
                return (p.x * Math.cos(alpha) - p.y * Math.sin(alpha));
            };

            if (isTorqueMode && lockedPivotIndex !== -1) {
                // 旋轉階段由當前鎖定的支腳產生推進位移 (考慮傾角變化帶來的水平推力)
                const prevWX = getWX(prevFeet[lockedPivotIndex], prevM);
                const currWX = getWX(allFeet[lockedPivotIndex], smoothedGround.m);
                frameDx = (prevWX - currWX);
            } else {
                let commonFeet = currentGroundedFeetIndices.filter(idx => prevGroundedFeetIndices.includes(idx));
                if (commonFeet.length > 0) {
                    let sumDx = 0;
                    for (let idx of commonFeet) {
                        const prevWX = getWX(prevFeet[idx], prevM);
                        const currWX = getWX(allFeet[idx], smoothedGround.m);
                        sumDx += (prevWX - currWX);
                    }
                    frameDx = (sumDx / commonFeet.length);
                } else if (prevGroundedFeetIndices.length > 0) {
                    let sumDx = 0;
                    for (let idx of prevGroundedFeetIndices) {
                        const prevWX = getWX(prevFeet[idx], prevM);
                        const currWX = getWX(allFeet[idx], smoothedGround.m);
                        sumDx += (prevWX - currWX);
                    }
                    frameDx = (sumDx / prevGroundedFeetIndices.length);
                }
            }
        }

        prevM = smoothedGround.m;

        prevGroundedFeetIndices = currentGroundedFeetIndices;
        currentWorldX += frameDx;

        prevFeet = allFeet.map(f => ({ x: f.x, y: f.y }));

        // 4.1 Real-time Speed Tracking (Aggressive EMA + Friction Filter)
        if (dt > 0) {
            let instantaneousSpeed = frameDx / dt; // pixels per second

            // --- Friction/Jitter Threshold ---
            // If movement opposes the direction of rotation (simSpeed) and is weak, treat as jitter
            const isOpposite = (simSpeed > 0 && instantaneousSpeed < 0) || (simSpeed < 0 && instantaneousSpeed > 0);
            if (isOpposite && Math.abs(instantaneousSpeed) < 10) {
                instantaneousSpeed = 0;
            }

            // Use alpha 0.05 (instead of 0.15) for much higher stability
            smoothedSpeed = 0.95 * smoothedSpeed + 0.05 * instantaneousSpeed;
            if (Math.abs(smoothedSpeed) < 0.5) smoothedSpeed = 0;
        }

        // 4.5. Mechanical Inertia Reaction (慣性反作用力模擬)
        // Use gravityScale as a mass/force multiplier
        const forceScale = 0.05 * gravityScale;
        // Crank reaction (equal and opposite to crank mass movement)
        // When crank swings back (-cos), body reacts forward (+cos)
        jitterX = -Math.cos(currentTheta) * R * forceScale;
        jitterY = -Math.sin(currentTheta) * R * forceScale;
        // Tilt reaction (subtle pulse at the back)
        jitterM = Math.sin(currentTheta - Math.PI / 4) * (R / S) * forceScale;

        // 5. Individual Foot Contact Tracking (單次觸地資料統計)
        let actualGrounded = new Set(currentGroundedFeetIndices);
        if (isTorqueMode && lockedPivotIndex !== -1) {
            actualGrounded.add(lockedPivotIndex);
        }

        for (let i = 0; i < 6; i++) {
            let isGroundedNow = actualGrounded.has(i);
            let track = footTracking[i];

            if (isGroundedNow && !track.isGrounded) {
                // Foot just touched the ground
                track.isGrounded = true;
                track.startX = currentWorldX;
                track.startTime = globalSimTime;
            } else if (!isGroundedNow && track.isGrounded) {
                // Foot just lifted off the ground - Calculate its duration and distance
                track.isGrounded = false;
                let dx = Math.abs(currentWorldX - track.startX);
                let t = globalSimTime - track.startTime;

                // Ignore extremely tiny micro-bounces (< 0.05s)
                if (t > 0.05) {
                    displayDist = dx;
                    displayTime = t;
                    displaySpeed = t > 0 ? (dx / t) : 0;
                }
            }
        }

        // 6. Record Paths
        if (recordPath) {
            paths.near.f.push({ ...near.foot_f }); paths.near.m.push({ ...near.foot_m }); paths.near.r.push({ ...near.foot_r });
            paths.far.f.push({ ...far.foot_f }); paths.far.m.push({ ...far.foot_m }); paths.far.r.push({ ...far.foot_r });

            if (paths.near.f.length > maxPathLen) {
                paths.near.f.shift(); paths.near.m.shift(); paths.near.r.shift();
                paths.far.f.shift(); paths.far.m.shift(); paths.far.r.shift();
            }
        }

        // 7. Drawing Ground (Solid Fill)
        ctx.save();
        if (povMode === 'robot') {
            const gX1 = -1000, gX2 = 1000;
            const gm1 = mapCoords({ x: gX1, y: smoothedGround.m * gX1 + smoothedGround.c });
            const gm2 = mapCoords({ x: gX2, y: smoothedGround.m * gX2 + smoothedGround.c });
            ctx.beginPath();
            ctx.moveTo(gm1.x, gm1.y);
            ctx.lineTo(gm2.x, gm2.y);
            ctx.lineTo(canvas.width + 100, canvas.height + 100);
            ctx.lineTo(-100, canvas.height + 100);
            ctx.closePath();
        } else {
            const gy = cy - groundY_Ideal * scale;
            ctx.beginPath();
            ctx.rect(0, gy, canvas.width, canvas.height - gy);
        }
        // Gradient for a premium "Field" look
        const groundGrad = ctx.createLinearGradient(0, 480, 0, canvas.height);
        groundGrad.addColorStop(0, '#10b981');
        groundGrad.addColorStop(1, '#065f46');
        ctx.fillStyle = groundGrad;
        ctx.fill();
        ctx.restore();

        // Ground Top Line
        ctx.beginPath();
        if (povMode === 'robot') {
            const gX1 = -1000, gX2 = 1000;
            const gm1 = mapCoords({ x: gX1, y: smoothedGround.m * gX1 + smoothedGround.c });
            const gm2 = mapCoords({ x: gX2, y: smoothedGround.m * gX2 + smoothedGround.c });
            ctx.moveTo(gm1.x, gm1.y);
            ctx.lineTo(gm2.x, gm2.y);
        } else {
            const gy = cy - groundY_Ideal * scale;
            ctx.moveTo(0, gy);
            ctx.lineTo(canvas.width, gy);
        }
        ctx.strokeStyle = '#059669';
        ctx.lineWidth = 3;
        ctx.stroke();

        drawPath(paths.far.f, 'rgba(239, 68, 68, 0.2)', [3, 3]);
        drawPath(paths.far.m, 'rgba(34, 197, 94, 0.2)', [3, 3]);
        drawPath(paths.far.r, 'rgba(59, 130, 246, 0.2)', [3, 3]);

        drawPath(paths.near.f, 'rgba(239, 68, 68, 0.7)', [5, 5]);
        drawPath(paths.near.m, 'rgba(34, 197, 94, 0.7)', [5, 5]);
        drawPath(paths.near.r, 'rgba(59, 130, 246, 0.7)', [5, 5]);

        // --- Render Far Side (Grouped Transparency) ---
        // 1. Draw to off-screen buffer with OPAQUE but FADED colors
        renderSide(far, true, offCtx);

        // --- 7. Robot Rendering (Buffered for Motion Blur) ---
        // 7.1 Clear robot buffer
        robotCtx.clearRect(0, 0, robotCanvas.width, robotCanvas.height);

        // 7.2 Draw Far Side to robot buffer
        offCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
        renderSide(far, true, offCtx);
        robotCtx.save();
        robotCtx.globalAlpha = 0.75;
        robotCtx.drawImage(offscreenCanvas, 0, 0);
        robotCtx.restore();

        // 7.3 Draw Structural Connections & Body to robot buffer
        const bodyY = -bodyYOffset;
        const connection_width = 12;
        drawLine(Pf, { x: Pf.x, y: bodyY }, '#64748b', connection_width, robotCtx);
        drawLine(Pr, { x: Pr.x, y: bodyY }, '#64748b', connection_width, robotCtx);

        // 7.4 Draw Motor & Gearbox to robot buffer
        const bodyCenterPos = mapCoords({ x: gearboxShiftX, y: bodyY });
        const bp1 = mapCoords({ x: -S, y: bodyY });
        const bp2 = mapCoords({ x: S, y: bodyY });
        const bodyAngle = Math.atan2(bp2.y - bp1.y, bp2.x - bp1.x);

        const customGearboxScale = (bodyYOffset * scale - 6) / 12.5;

        robotCtx.save();
        robotCtx.translate(bodyCenterPos.x, bodyCenterPos.y);
        robotCtx.rotate(bodyAngle);
        robotCtx.scale(customGearboxScale, customGearboxScale);

        // --- DRAW MOTOR (Below Gearbox) ---
        // Motor is translated by (52, 2.5) relative to gearbox (0,0)
        // Since gearbox is translated by (-18.5, -27), motor is at (-18.5 + 52, -27 + 2.5) = (33.5, -24.5)
        robotCtx.save();
        robotCtx.translate(33.5, -24.5);
        
        // Define motor sectional fills (using manual rects to match SVG look)
        robotCtx.fillStyle = motorLightGrey;
        robotCtx.fillRect(0, 0, 10.5, 4);
        robotCtx.fillRect(0, 16, 10.5, 4);
        robotCtx.fillStyle = motorMediumGrey;
        robotCtx.fillRect(0, 4, 10.5, 12);
        robotCtx.fillStyle = '#ffffff';
        robotCtx.fillRect(10.5, 0, 5, 20);
        robotCtx.fillStyle = motorDarkGrey;
        robotCtx.fillRect(10.5, 6.25, 3, 7.5);
        
        // Fills for protrusions (simplified)
        robotCtx.fillStyle = '#f0f0f0';
        robotCtx.fillRect(15.5, 5, 2.5, 10);
        robotCtx.fillStyle = '#DCDCDC';
        robotCtx.fillRect(18.0, 9, 1.0, 2);

        // Motor Outline
        robotCtx.strokeStyle = '#333333';
        robotCtx.lineWidth = 0.1;
        if (typeof motorSVGPath !== 'undefined') {
            robotCtx.stroke(motorSVGPath);
        }

        // Bronze Parts
        const drawBronze = (bx, by, isBottom) => {
            robotCtx.fillStyle = motorBronze;
            robotCtx.strokeStyle = motorBronzeStroke;
            robotCtx.lineWidth = 0.1;
            robotCtx.beginPath();
            if(!isBottom) {
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
            
            // Hole in bronze
            robotCtx.fillStyle = '#ffffff';
            robotCtx.beginPath();
            if(!isBottom) {
                robotCtx.moveTo(bx+0.5, by-1); robotCtx.lineTo(bx+0.5, by-2.5);
                robotCtx.arc(bx+1, by-2.5, 0.5, Math.PI, 0);
                robotCtx.lineTo(bx+1.5, by-1);
            } else {
                robotCtx.moveTo(bx+0.5, by+1); robotCtx.lineTo(bx+0.5, by+2.5);
                robotCtx.arc(bx+1, by+2.5, 0.5, Math.PI, 0, true);
                robotCtx.lineTo(bx+1.5, by+1);
            }
            robotCtx.closePath();
            robotCtx.fill(); robotCtx.stroke();
        };
        drawBronze(11.5, 6.25, false);
        drawBronze(11.5, 13.75, true);
        
        robotCtx.restore();

        // --- DRAW GEARBOX (On Top) ---
        robotCtx.save();
        robotCtx.translate(-18.5, -27);
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

        // 7.5 Draw Body Main Beam & Pivot Points to robot buffer
        drawLine({ x: -S - 15, y: bodyY }, { x: S + 15, y: bodyY }, '#94a3b8', 12, robotCtx);
        drawPoint(Pf, '#0f172a', 6, robotCtx);
        drawPoint(Pr, '#0f172a', 6, robotCtx);
        drawPoint(C_crank, '#ef4444', 7, robotCtx);

        // 7.6 Draw Near Side to robot buffer
        renderSide(near, false, robotCtx);

        // 7.7 Now render the robotCanvas to the main ctx with Motion Blur
        const { echoCount, echoOffsetMult, echoBaseAlpha } = speedVizConfig;

        // Draw the Echoes (Ghosts) - Driven by stable cycle average
        const vizSpeed = cycleAvgSpeed;
        if (Math.abs(vizSpeed) > 1) {
            for (let i = echoCount; i >= 1; i--) {
                const offsetX = -vizSpeed * echoOffsetMult * i * scale;
                const alpha = (echoBaseAlpha / i) * Math.min(1.0, Math.abs(vizSpeed) / 30);
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.drawImage(robotCanvas, offsetX, 0);
                ctx.restore();
            }
        }

        // Final main robot on top
        ctx.drawImage(robotCanvas, 0, 0);

        // --- HIGHLIGHT GROUND PIVOT POINTS ---
        if (overlayAlpha > 0.01) {
            ctx.save();
            ctx.globalAlpha = overlayAlpha;
            if (isTorqueMode && lockedPivot) {
                drawPoint(lockedPivot, '#ef4444', 6);
                const mp = mapCoords(lockedPivot);
                ctx.beginPath();
                ctx.arc(mp.x, mp.y, 14, 0, Math.PI * 2);
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 3;
                ctx.stroke();
            } else if (prevGroundedFeetIndices && prevGroundedFeetIndices.length > 0) {
                for (let idx of prevGroundedFeetIndices) {
                    let f = allFeet[idx];
                    drawPoint(f, '#ef4444', 5);
                    const mp = mapCoords(f);
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
        prevFeet = null;
        prevGroundedFeetIndices = [];
        // Reset tracking on clash
        footTracking.forEach(track => track.isGrounded = false);
    }

    // 8. Render Movement Statistics Overlay (右上角數值面板) - Only in Admin Mode (with Fade)
    if (overlayAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = overlayAlpha;
        drawOverlayStats();
        ctx.restore();
    }
}

function drawOverlayStats() {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(canvas.width - 240, 15, 225, 120);

    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(canvas.width - 240, 15, 4, 120);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 15px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText('單腳觸地推進數據', canvas.width - 220, 40);

    ctx.font = '14px "JetBrains Mono", monospace';

    ctx.fillStyle = '#94a3b8';
    ctx.fillText('前次腳步推進: ', canvas.width - 220, 70);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`${displayDist.toFixed(1)} mm`, canvas.width - 110, 70);

    ctx.fillStyle = '#94a3b8';
    ctx.fillText('前次腳步均速: ', canvas.width - 220, 95);
    ctx.fillStyle = '#34d399';
    ctx.fillText(`${displaySpeed.toFixed(1)} mm/s`, canvas.width - 110, 95);

    ctx.fillStyle = '#94a3b8';
    ctx.fillText('當前移動速度: ', canvas.width - 220, 120);
    ctx.fillStyle = '#facc15';
    ctx.fillText(`${smoothedSpeed.toFixed(1)} mm/s`, canvas.width - 110, 120);
}

function animate() {
    let now = performance.now();
    let dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    if (isPlaying) {
        theta += simSpeed;
        globalSimTime += dt;

        // Track cycle completion for averaging (when theta crosses 0)
        // Check for wrapping in both directions
        const crossedZero = (prevTheta > theta && simSpeed > 0) || (prevTheta < theta && simSpeed < 0);
        if (crossedZero) {
            const dx = Math.abs(currentWorldX - lastCycleX);
            const dt_cycle = globalSimTime - lastCycleTime;
            if (dt_cycle > 0.05) { // Minimum 0.05s to avoid tiny slivers
                const newAvg = dx / dt_cycle;
                // Blend cycle average for smoothness, but faster responsive if it was 0
                const alpha = cycleAvgSpeed === 0 ? 1.0 : 0.3;
                cycleAvgSpeed = (1 - alpha) * cycleAvgSpeed + alpha * newAvg;
            }
            lastCycleX = currentWorldX;
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

        // User Request: Whatever the direction is, the slider should move from left to right (0 to 360)
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

    if (isPlaying || isTorqueMode || Math.abs(angularVel) > 0.001 || smoothedSpeed > 0.1 || (isAdminMode && overlayAlpha < 1) || (!isAdminMode && overlayAlpha > 0)) {
        isLooping = true;
        requestAnimationFrame(animate);
    } else {
        isLooping = false;
        smoothedSpeed = 0; // Snap to zero when very low
        renderFrame(theta, false, 0); // Final render to update UI to 0
    }

    // Update overlay Alpha for smooth fade
    const fadeSpeed = 0.05;
    if (isAdminMode) overlayAlpha = Math.min(1, overlayAlpha + fadeSpeed);
    else overlayAlpha = Math.max(0, overlayAlpha - fadeSpeed);

    // Update particles regardless of isPlaying (to handle residual speed)
    speedParticles.forEach(p => p.update(dt, smoothedSpeed));
    particles.forEach(p => p.update(dt, smoothedSpeed));
    trees.forEach(t => t.update(dt, cycleAvgSpeed));
}

function triggerUpdate() {
    if (!isLooping) {
        lastFrameTime = performance.now(); // Reset time to avoid large jumps when unpausing
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
    triggerUpdate();
});

document.getElementById('povBtn').addEventListener('click', (e) => {
    povMode = povMode === 'world' ? 'robot' : 'world';
    const text = povMode === 'world' ? "視角：以世界為中心" : "視角：以機器人為中心";
    e.target.innerText = text;
    paths = { near: { f: [], m: [], r: [] }, far: { f: [], m: [], r: [] } };
    triggerUpdate();
});

const setupSlider = (id, valId, callback) => {
    document.getElementById(id).addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById(valId).innerText = val;
        callback(val * globalScale); // Apply globalScale here
        paths = { near: { f: [], m: [], r: [] }, far: { f: [], m: [], r: [] } };
        triggerUpdate();
    });
};

setupSlider('lLegSlider', 'lLegVal', (v) => {
    L_leg = v;
    // 同步 L_foot 以強制維持 SVG 視覺幾何的正確比例 (尖端與支點的比例 = 41.54:45)
    L_foot = L_leg * (41.54 / 45);
    document.getElementById('lFootSlider').value = L_foot / globalScale;
    document.getElementById('lFootVal').innerText = (L_foot / globalScale).toFixed(1) + " (Fixed)";
});
setupSlider('lBlueSlider', 'lBlueVal', (v) => L_blue = v);
// L_footSlider 不再負責手動調整，已被鎖死
setupSlider('lFootSlider', 'lFootVal', (v) => { });
setupSlider('gearboxShiftSlider', 'gearboxShiftVal', (v) => {
    gearboxShiftX = v / globalScale;
    updateCrankPosition(); // Sync physical pivot with visual gearbox
    paths = { near: { f: [], m: [], r: [] }, far: { f: [], m: [], r: [] } };
    triggerUpdate();
});

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
            paths = { near: { f: [], m: [], r: [] }, far: { f: [], m: [], r: [] } };
            triggerUpdate();
        });
    }
}

// Init
animate();
