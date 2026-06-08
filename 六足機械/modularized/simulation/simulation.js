/**
 * Hexapod Simulator - Kinematics and Physics Logic
 */
// ==========================================
// [SECTION 1: Imports & Initialization]
// ==========================================
import { HexapodRenderer } from './renderer.js';
import { BGScroller } from './bg_scroll.js';
import { ChronoRecorder } from './chrono_recorder.js';
import { TrajectoryTracker } from './trajectory.js';
import { checkLegCollision } from './collision.js';

// Initialize ChronoRecorder with 6 frames per cycle (60 degrees)
const chronoRecorder = new ChronoRecorder(1120, 630, 6);
const trajectoryTracker = new TrajectoryTracker(400); // 新增軌跡追蹤器
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

const renderer = new HexapodRenderer(ctx, offCtx, robotCtx, canvas);

// ==========================================
// [SECTION 2: Machine Geometry & Parameters]
// ==========================================
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

// ==========================================
// [SECTION 3: SVG Path Generation]
// ==========================================
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

// ==========================================
// [SECTION 4: Viewport & Dynamic Height]
// ==========================================
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

let simSpeed = -0.1;
let gravityScale = 1.0;

// ==========================================
// [SECTION 5: Admin Mode Controller]
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
let showHitbox = false;


let isLooping = false;
let playOnePeriod = false;
let accumulatedTheta = 0;

// ==========================================
// [SECTION 6: Physics State Variables]
// ==========================================
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
let speedHistory = [];
let displayAvg10Speed = 0;
let isAvgSpeedStable = true;
let smoothedSpeed = 0;
let cycleAvgSpeed = 0;
let lastCycleX = 0;
let lastCycleTime = 0;

let minComY_Cycle = Infinity;
let maxComY_Cycle = -Infinity;
let comVerticalChange_Display = 0;
let prevTheta = 0;
let globalSimTime = 0;
let lastFrameTime = performance.now();

// --- Speed Visualization State ---
// Scenic objects removed as requested
// const particles = Array.from({ length: 40 }, () => new Particle());
// const trees = Array.from({ length: 6 }, () => new Tree());
// let speedParticles = Array.from({ length: speedVizConfig.particleCount }, () => new SpeedParticle());


// Viewport Settings (Moved to top to prevent ReferenceError)

// ==========================================
// [SECTION 7: Math & Geometry Helpers]
// ==========================================
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

    // 計算沿著腿部中心線到底部的固定端點
    const tip_x = P_bottom.x + (dx / L_curr) * L_foot;
    const tip_y = P_bottom.y + (dy / L_curr) * L_foot;

    return { x: Cx + dx_cp, y: Cy + dy_cp, cx: Cx, cy: Cy, tip_x, tip_y, rot_local: rot };
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

// ==========================================
// [SECTION 8: Main Physics & Render Loop]
// ==========================================
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
        let legOverlaps = { near: [], far: [] };

        if (near && far) {
            const checkSide = (data) => {
                const legs = [
                    { name: 'F', top: data.FT, foot: data.foot_f, idx: 0 },
                    { name: 'M', top: data.MT, foot: data.foot_m, idx: 1 },
                    { name: 'R', top: data.RT, foot: data.foot_r, idx: 2 }
                ];
                let overlaps = [];
                for (let i = 0; i < legs.length; i++) {
                    for (let j = i + 1; j < legs.length; j++) {
                        const col = checkLegCollision(legs[i], legs[j], globalScale);
                        if (col.collided) {
                            overlaps.push({ leg1: legs[i], leg2: legs[j], pt: col.pt });
                        }
                    }
                }
                return overlaps;
            };

            legOverlaps.near = checkSide(near);
            legOverlaps.far = checkSide(far);

            if (legOverlaps.near.length > 0 || legOverlaps.far.length > 0) {
                isClashing = true;
                isPlaying = false;
                window.simulationErrorMsg = '機構干涉：腳部形狀發生碰撞！請調整連桿參數。';
            }

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
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        background.update(deltaCamX);
        background.render(ctx);

        if (near && far) {
            const allFeetLocal = [
                near.foot_f, near.foot_m, near.foot_r,
                far.foot_f, far.foot_m, far.foot_r
            ];

            const cx = canvas.width / 2;

            trajectoryTracker.record(allFeetLocal, bodyX, bodyY, bodyRoll, isPlaying, bodyVelX);

            const state = {
                near, far, allFeetLocal, bodyRoll, bodyX, bodyY, scale, targetGy, cx,
                AdminController, robotCanvas, offscreenCanvas,
                Pf, Pr, C_crank, gearboxShiftX, bodyYOffset, S,
                showGroundline, showFriction, showHitbox, validLines, invalidCOMLines, groundLine,
                footStates, lastGroundedIndices, globalScale,
                trajectoryTracker, cameraX,
                legSVGPath, legSVG_h2y, currentCrankHoleY,
                displayDist, displaySpeed, displayAvg10Speed, isAvgSpeedStable, isStableSupport, comVerticalChange_Display,
                footStiffness, legOverlaps
            };

            renderer.renderScene(state);

        } else {
            window.simulationErrorMsg = '幾何約束衝突！請嘗試減小曲柄半徑。';
            ctx.fillStyle = '#f87171';
            ctx.font = 'bold 22px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText(window.simulationErrorMsg, canvas.width / 2, canvas.height / 2);

            // Draw it on robotCanvas too if we are recording
            robotCtx.clearRect(0, 0, robotCanvas.width, robotCanvas.height);
            robotCtx.fillStyle = '#f87171';
            robotCtx.font = 'bold 22px system-ui';
            robotCtx.textAlign = 'center';
            robotCtx.fillText(window.simulationErrorMsg, robotCanvas.width / 2, robotCanvas.height / 2);
        }

        // 8. 繪製統計數據面板 (僅在管理員模式下顯示)
        if (AdminController.overlayAlpha > 0.01) {
            // drawOverlayStats is now handled by Renderer
        }

        // 紀錄數據用於 AI 診斷
        if (typeof recordAnalyticsData === 'function') {
            recordAnalyticsData();
        }

        // Live Trailing Capture Hook for Chronophotography
        if (chronoRecorder.isRecording) {
            window.simulationErrorMsg = null;
            chronoRecorder.captureFrameHook(currentTheta, robotCanvas, cameraX, scale, targetGy);
        }
    } catch (err) {
        window.simulationErrorMsg = "Render Error: " + err.message;
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

// ==========================================
// [SECTION 9: Animation Loop]
// ==========================================
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

        // 將 simSpeed (原為 rad/frame) 轉換為 rad/sec (假設基準 60fps)，並乘上時間差 simDt 確保跨裝置等速
        theta += (simSpeed * 60) * simDt;
        globalSimTime += simDt;

        // track COM vertical position
        const currentComY = bodyY - bodyYOffset * Math.cos(bodyRoll);
        if (currentComY < minComY_Cycle) minComY_Cycle = currentComY;
        if (currentComY > maxComY_Cycle) maxComY_Cycle = currentComY;

        // Track cycle completion for averaging (when theta crosses 0)
        // Check for wrapping in both directions
        const crossedZero = (prevTheta > theta && simSpeed > 0) || (prevTheta < theta && simSpeed < 0);
        if (crossedZero) {
            const dx = Math.abs(bodyX - lastCycleX);
            const dt_cycle = globalSimTime - lastCycleTime;
            if (dt_cycle > 0.05) { // Minimum 0.05s to avoid tiny slivers
                const newAvg = dx / dt_cycle;
                // Blend cycle average for smoothness, but faster responsive if it was 0
                const alpha = cycleAvgSpeed === 0 ? 1.0 : 0.8;
                cycleAvgSpeed = (1 - alpha) * cycleAvgSpeed + alpha * newAvg;

                // 將畫布座標系的數據轉換為物理單位 (mm) 並更新給 UI 顯示
                displaySpeed = cycleAvgSpeed / globalScale;
                displayDist = dx / globalScale;

                speedHistory.push(newAvg / globalScale);
                if (speedHistory.length > 10) speedHistory.shift();
                displayAvg10Speed = speedHistory.reduce((a, b) => a + b, 0) / speedHistory.length;
                const maxSpd = Math.max(...speedHistory);
                const minSpd = Math.min(...speedHistory);
                isAvgSpeedStable = speedHistory.length < 3 || (maxSpd - minSpd) < Math.max(0.05 * displayAvg10Speed, 0.5);

                if (maxComY_Cycle !== -Infinity && minComY_Cycle !== Infinity) {
                    comVerticalChange_Display = (maxComY_Cycle - minComY_Cycle) / globalScale;
                }
            }
            lastCycleX = bodyX;
            lastCycleTime = globalSimTime;
            minComY_Cycle = Infinity;
            maxComY_Cycle = -Infinity;
        }
        prevTheta = theta;

        if (playOnePeriod) {
            accumulatedTheta += Math.abs(simSpeed * 60) * simDt;
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

// ==========================================
// [SECTION 10: UI Event Handlers]
// ==========================================
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

document.getElementById('toggleHitboxBtn').addEventListener('click', (e) => {
    showHitbox = !showHitbox;
    e.target.classList.toggle('active', showHitbox);
    triggerUpdate();
});

// 綁定軌跡相關的 UI (Switch 和 Clear 按鈕)
trajectoryTracker.bindUI('showPathsCheck', 'clearBtn', triggerUpdate);

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
    for (let i = 0; i < 6; i++) footStates[i].isGrounded = false;
    triggerUpdate();
});

const setupSlider = (id, valId, callback) => {
    document.getElementById(id).addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById(valId).innerText = val;
        callback(val * globalScale); // Apply globalScale here
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
    triggerUpdate();
});

setupSlider('sSlider', 'sVal', (v) => {
    S = v;
    Pf.x = -S;
    Pr.x = S;
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

    trajectoryTracker.clear(); // 重置時清空軌跡

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
    minComY_Cycle = Infinity;
    maxComY_Cycle = -Infinity;
    comVerticalChange_Display = 0;

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

            triggerUpdate();
        });

    }
}

// ==========================================
// [SECTION 11: AI Diagnostic Support]
// ==========================================
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

    return {
        symptom: {
            isClashing: hasConflict,
            isStable: isStable,
            hopRange: hasConflict ? 0 : parseFloat(hopRange.toFixed(1)),
            speed: currentSpeed
        },
        params: {
            legLength: Math.round(L_leg / globalScale),
            footLength: Math.round(L_foot / globalScale),
            blueLink: Math.round(L_blue / globalScale),
            bodyWidth: Math.round(S / globalScale),
            crankRadius: Math.round(R),
            phaseDiff: Math.round((phaseDiff / Math.PI) * 180),
            gearboxShift: parseFloat((gearboxShiftX * globalScale).toFixed(1)),
            motorTargetSpeed: parseFloat((Math.abs(simSpeed * 60)).toFixed(1)),
            expectedNormalSpeed: Math.round(R * Math.abs(simSpeed * 60))
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
window.startChronoRecording = (paramsJson, isContinuous = false) => {
    const promise = chronoRecorder.start(paramsJson, cameraX, theta, isPlaying, isContinuous, isClashing);
    // Force the first frame capture immediately if recording just started
    if (chronoRecorder.isRecording) {
        chronoRecorder.doCapture(robotCanvas, cameraX, scale, targetGy);
    }
    return promise;
};

// ==========================================
// [SECTION 12: Chronophotography Mode]
// ==========================================
// --- Chronophotography Mode ---
let isChronoViewMode = false;
const chronoDisplayCanvas = document.getElementById('chronoDisplay');
const chronoDisplayCtx = chronoDisplayCanvas ? chronoDisplayCanvas.getContext('2d') : null;

const toggleChronoViewBtn = document.getElementById('toggleChronoViewBtn');

if (toggleChronoViewBtn && chronoDisplayCanvas) {
    const toggleGroundlineBtn = document.getElementById('toggleGroundlineBtn');
    const toggleFrictionBtn = document.getElementById('toggleFrictionBtn');
    const toggleHitboxBtn = document.getElementById('toggleHitboxBtn');
    toggleChronoViewBtn.addEventListener('click', () => {
        isChronoViewMode = !isChronoViewMode;
        const simCanvas = document.getElementById('simCanvas');

        if (isChronoViewMode) {
            toggleChronoViewBtn.classList.add('active');
            simCanvas.style.display = 'none';
            chronoDisplayCanvas.style.display = 'block';

            // Render the current state of chronoRecorder's canvas
            chronoDisplayCtx.fillStyle = '#1e1e1e';
            chronoDisplayCtx.fillRect(0, 0, chronoDisplayCanvas.width, chronoDisplayCanvas.height);
            chronoDisplayCtx.drawImage(chronoRecorder.chronoCanvas, 0, 0);

            // Auto start continuous recording
            const paramsJson = JSON.stringify(window.getSimplifiedAnalytics ? window.getSimplifiedAnalytics() : {});
            chronoRecorder.cachedImage = null;
            chronoRecorder.cachedParamSignature = null;

            if (!isPlaying) {
                const toggleBtn = document.getElementById('toggleBtn');
                if (toggleBtn) toggleBtn.click();
            }

            window.startChronoRecording(paramsJson, true);
        } else {
            toggleChronoViewBtn.classList.remove('active');
            simCanvas.style.display = 'block';
            chronoDisplayCanvas.style.display = 'none';
            chronoRecorder.isRecording = false; // stop continuous recording
        }
    });
}

// Hook into requestAnimationFrame to copy chronoRecorder's canvas to chronoDisplayCanvas while recording
const originalRequestAnimationFrame = window.requestAnimationFrame;
window.requestAnimationFrame = function (callback) {
    return originalRequestAnimationFrame((time) => {
        if (isChronoViewMode && chronoDisplayCtx) {
            // Continuously draw the chrono recorder canvas so the user sees the overlapping updates
            chronoDisplayCtx.drawImage(chronoRecorder.chronoCanvas, 0, 0);

            if (window.simulationErrorMsg) {
                chronoDisplayCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                chronoDisplayCtx.fillRect(0, 0, chronoDisplayCanvas.width, chronoDisplayCanvas.height);
                chronoDisplayCtx.fillStyle = '#f87171';
                chronoDisplayCtx.font = 'bold 22px system-ui';
                chronoDisplayCtx.textAlign = 'center';
                chronoDisplayCtx.fillText(window.simulationErrorMsg, chronoDisplayCanvas.width / 2, chronoDisplayCanvas.height / 2);
            }
        }
        callback(time);
    });
};
