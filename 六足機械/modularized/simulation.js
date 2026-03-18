/**
 * Hexapod Simulator - Kinematics and Physics Logic
 */
const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

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
let L_foot = 25.0 * (36 / 45) * globalScale; // 鎖定與 SVG 的幾何比例 (腳尖:支點) = 36:45
let gearboxShiftX = 0;

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

let paths = { near: { f: [], m: [], r: [] }, far: { f: [], m: [], r: [] } };
const maxPathLen = 150;

let isLooping = false;
let playOnePeriod = false;
let accumulatedTheta = 0;

// Physics State
let smoothedGround = { m: 0, c: groundY_Ideal };
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
 * 腳部幾何: rx=25, ry=13, 中心距離底部孔位 23, 總長(含墊片)參考 SVGs.js
 **/
function getEllipticFootPoint(P_top, P_bottom, m = 0) {
    const dx = P_bottom.x - P_top.x, dy = P_bottom.y - P_top.y;
    const L_curr = Math.sqrt(dx * dx + dy * dy);
    if (L_curr === 0) return P_bottom;

    const phi = Math.atan2(dy, dx);
    const rot = phi - Math.PI / 2; // 橢圓局部 X 軸與機器 X 軸夾角

    // 縮放比例基於 L_leg/45
    const s = L_curr / 45.0;
    const a = 25 * s;
    const b = 13 * s;
    const centerDist = 23 * s;

    // 橢圓中心位置
    const Cx = P_bottom.x + (dx / L_curr) * centerDist;
    const Cy = P_bottom.y + (dy / L_curr) * centerDist;

    // 計算在斜率 m 下，橢圓中心到切線的垂直距離 h (y = mx + c 型式)
    // 公式: h = sqrt( a^2 * (sin(rot) - m*cos(rot))^2 + b^2 * (cos(rot) + m*sin(rot))^2 )
    const sinR = Math.sin(rot), cosR = Math.cos(rot);
    const h = Math.sqrt(Math.pow(a * (sinR - m * cosR), 2) + Math.pow(b * (cosR + m * sinR), 2));

    return { x: Cx, y: Cy - h };
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

function drawSVGLink(p1, p2, svgPath, h1x, h1y, h2x, h2y, strokeColor, fillColor, isFar) {
    if (!p1 || !p2) return;
    const m1 = mapCoords(p1), m2 = mapCoords(p2);
    const dx = m2.x - m1.x, dy = m2.y - m1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const svgDist = Math.sqrt(Math.pow(h2x - h1x, 2) + Math.pow(h2y - h1y, 2));
    const scale = dist / svgDist;
    const angle = Math.atan2(dy, dx);
    const svgAngle = Math.atan2(h2y - h1y, h2x - h1x);

    ctx.save();
    ctx.translate(m1.x, m1.y);
    ctx.rotate(angle - svgAngle);
    ctx.scale(scale, scale);
    ctx.translate(-h1x, -h1y);

    ctx.globalAlpha = isFar ? 0.35 : 1.0;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5 / scale;
    if (fillColor) {
        ctx.fillStyle = fillColor;
        ctx.fill(svgPath);
    }
    ctx.stroke(svgPath);
    ctx.restore();
}

function drawLine(p1, p2, color, width) {
    if (!p1 || !p2) return;
    const m1 = mapCoords(p1), m2 = mapCoords(p2);
    ctx.beginPath();
    ctx.moveTo(m1.x, m1.y);
    ctx.lineTo(m2.x, m2.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
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

function drawPoint(p, color, radius) {
    const mp = mapCoords(p);
    ctx.beginPath();
    ctx.arc(mp.x, mp.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
}

function renderSide(data, isFar) {
    const alpha = isFar ? 0.25 : 1.0;
    const jointColor = `rgba(30, 41, 59, ${alpha})`;
    const widthScale = isFar ? 0.8 : 1.0;

    // Define drawing parts
    const drawCrank = () => {
        const crankFill = '#e2e8f0';
        const crankStroke = '#94a3b8';
        if (typeof crankSVGPath !== 'undefined') {
            drawSVGLink(C_crank, data.ML, crankSVGPath, 8.7, 8.7, 8.7, currentCrankHoleY, crankStroke, crankFill, isFar);
        } else {
            const crankColor = `rgba(203, 213, 225, ${alpha})`;
            drawLine(C_crank, data.ML, crankColor, 4 * widthScale);
        }
    };

    const drawRods = () => {
        const rodFill = '#3b82f6';
        const rodStroke = '#1d4ed8';
        drawSVGLink(data.ML, data.RT, rodSVGPath, 10, 10, 10, 102, rodStroke, rodFill, isFar);
        drawSVGLink(Pf, data.MT, rodSVGPath, 10, 10, 10, 102, rodStroke, rodFill, isFar);
        drawSVGLink(data.FT, data.ML, rodSVGPath, 10, 10, 10, 102, rodStroke, rodFill, isFar);
    };

    const drawLegs = () => {
        const legFill = '#facc15';
        const legStroke = '#b45309';
        drawSVGLink(data.FT, Pf, legSVGPath, 30, 20, 30, 65, legStroke, legFill, isFar);
        drawSVGLink(data.MT, data.ML, legSVGPath, 30, 20, 30, 65, legStroke, legFill, isFar);
        drawSVGLink(data.RT, Pr, legSVGPath, 30, 20, 30, 65, legStroke, legFill, isFar);
    };

    // Execute drawing based on final depth requirements
    if (isFar) {
        // Far Side: Rod (Bottom) → Leg (Middle) → Crank (Top)
        drawRods();
        drawLegs();
        drawCrank();
    } else {
        // Near Side: Crank (Bottom) → Leg (Middle) → Rod (Top)
        drawCrank();
        drawLegs();
        drawRods();
    }

    // Joints always on top
    drawPoint(data.ML, jointColor, 4 * widthScale);
    drawPoint(data.FT, jointColor, 4 * widthScale);
    drawPoint(data.MT, jointColor, 4 * widthScale);
    drawPoint(data.RT, jointColor, 4 * widthScale);
}

/**
 * Main Render and Physics Logic Loop
 */
function renderFrame(currentTheta, recordPath) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

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
            if (isTorqueMode && lockedPivotIndex !== -1) {
                // 旋轉階段只由當前鎖定的支腳產生推進位移
                frameDx = prevFeet[lockedPivotIndex].x - allFeet[lockedPivotIndex].x;
            } else {
                let commonFeet = currentGroundedFeetIndices.filter(idx => prevGroundedFeetIndices.includes(idx));
                if (commonFeet.length > 0) {
                    let sumDx = 0;
                    for (let idx of commonFeet) sumDx += (prevFeet[idx].x - allFeet[idx].x);
                    frameDx = sumDx / commonFeet.length;
                } else if (prevGroundedFeetIndices.length > 0) {
                    let sumDx = 0;
                    for (let idx of prevGroundedFeetIndices) sumDx += (prevFeet[idx].x - allFeet[idx].x);
                    frameDx = sumDx / prevGroundedFeetIndices.length;
                }
            }
        }

        prevGroundedFeetIndices = currentGroundedFeetIndices;
        currentWorldX += frameDx;
        prevFeet = allFeet.map(f => ({ x: f.x, y: f.y }));

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

        // 7. Drawing Order
        ctx.beginPath();
        if (povMode === 'robot') {
            const gX1 = -350, gX2 = 350;
            const gm1 = mapCoords({ x: gX1, y: smoothedGround.m * gX1 + smoothedGround.c });
            const gm2 = mapCoords({ x: gX2, y: smoothedGround.m * gX2 + smoothedGround.c });
            ctx.moveTo(gm1.x, gm1.y);
            ctx.lineTo(gm2.x, gm2.y);
        } else {
            const gy = cy - groundY_Ideal * scale;
            ctx.moveTo(0, gy);
            ctx.lineTo(canvas.width, gy);
        }
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 3;
        ctx.stroke();

        drawPath(paths.far.f, 'rgba(239, 68, 68, 0.2)', [3, 3]);
        drawPath(paths.far.m, 'rgba(34, 197, 94, 0.2)', [3, 3]);
        drawPath(paths.far.r, 'rgba(59, 130, 246, 0.2)', [3, 3]);

        drawPath(paths.near.f, 'rgba(239, 68, 68, 0.7)', [5, 5]);
        drawPath(paths.near.m, 'rgba(34, 197, 94, 0.7)', [5, 5]);
        drawPath(paths.near.r, 'rgba(59, 130, 246, 0.7)', [5, 5]);

        renderSide(far, true);

        // --- Structural Connections & Body ---
        const bodyY = -bodyYOffset;
        const connection_width = 12;
        drawLine(Pf, { x: Pf.x, y: bodyY }, '#64748b', connection_width);
        drawLine(Pr, { x: Pr.x, y: bodyY }, '#64748b', connection_width);

        // 移除原有的中央垂直支架，改為渲染齒輪箱
        // drawLine(C_crank, { x: C_crank.x, y: bodyY }, '#64748b', connection_width); // Connection to crank center

        // --- 繪製齒輪箱 (Gearbox) ---
        // 對齊於底部中點 (x = 18.5) 加上使用者的齒輪箱位移
        const bodyCenterPos = mapCoords({ x: gearboxShiftX, y: bodyY });
        const bp1 = mapCoords({ x: -S, y: bodyY });
        const bp2 = mapCoords({ x: S, y: bodyY });
        const bodyAngle = Math.atan2(bp2.y - bp1.y, bp2.x - bp1.x);

        ctx.save();
        ctx.translate(bodyCenterPos.x, bodyCenterPos.y);
        ctx.rotate(bodyAngle);

        const bodyDistancePx = bodyYOffset * scale;
        const barThicknessPx = 12; // 對應下方 drawLine 的 linewidth
        const targetDistPx = bodyDistancePx - (barThicknessPx / 2.0);

        const svgBottomDist = 25.0 - 12.5;
        const customGearboxScale = targetDistPx / svgBottomDist;

        ctx.scale(customGearboxScale, customGearboxScale);

        // 以底部小方塊 (x=18.5, y=27) 為中心對齊車體
        ctx.translate(-18.5, -27);

        // User 需求: Filled the gearbox with grey color and use creamy white as boarder line color
        ctx.fillStyle = '#8a8d91';         // 灰色 (Grey color)
        ctx.strokeStyle = '#fdfbf7';       // 米白色 / 奶油白 (Creamy white)
        ctx.lineWidth = 1.5 / customGearboxScale; // 維持框線的視覺粗細不被縮放影響

        // 執行繪製 (路徑由 svgs.js 動態加載而來)
        if (typeof gearboxSVGPath !== 'undefined') {
            ctx.fill(gearboxSVGPath);
            ctx.stroke(gearboxSVGPath);
        }
        ctx.restore();

        // 畫這條橫槓車體（覆蓋在齒輪箱上面看起來更有結構感）
        drawLine({ x: -S - 15, y: bodyY }, { x: S + 15, y: bodyY }, '#94a3b8', 12);

        drawPoint(Pf, '#0f172a', 6);
        drawPoint(Pr, '#0f172a', 6);
        drawPoint(C_crank, '#ef4444', 7);

        renderSide(near, false);

        // --- HIGHLIGHT GROUND PIVOT POINTS ---
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

    // 8. Render Movement Statistics Overlay (右上角數值面板)
    drawOverlayStats();
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
    ctx.fillText(`${displayDist.toFixed(1)} px`, canvas.width - 110, 70);

    ctx.fillStyle = '#94a3b8';
    ctx.fillText('前次腳步均速: ', canvas.width - 220, 95);
    ctx.fillStyle = '#34d399';
    ctx.fillText(`${displaySpeed.toFixed(1)} px/s`, canvas.width - 110, 95);

    ctx.fillStyle = '#94a3b8';
    ctx.fillText('當前觸地進度: ', canvas.width - 220, 120);
    ctx.fillStyle = '#facc15';

    // Find the progress of the foot that has been grounded the longest currently
    let currentActiveDist = 0;
    let earliestStart = Infinity;
    for (let i = 0; i < 6; i++) {
        if (footTracking[i].isGrounded && footTracking[i].startTime < earliestStart) {
            earliestStart = footTracking[i].startTime;
            currentActiveDist = Math.abs(currentWorldX - footTracking[i].startX);
        }
    }
    ctx.fillText(`${currentActiveDist.toFixed(1)} px`, canvas.width - 110, 120);
}

function animate() {
    let now = performance.now();
    let dt = (now - lastFrameTime) / 1000; // Delta time in seconds
    lastFrameTime = now;

    if (isPlaying) {
        theta += simSpeed;
        globalSimTime += dt;

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

    renderFrame(theta, isPlaying);

    if (isPlaying || isTorqueMode || Math.abs(angularVel) > 0.001) {
        isLooping = true;
        requestAnimationFrame(animate);
    } else {
        isLooping = false;
    }
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

document.getElementById('povSelect').addEventListener('change', (e) => {
    povMode = e.target.value;
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
    // 同步 L_foot 以強制維持 SVG 視覺幾何的正確比例 (尖端與支點的比例 = 36:45)
    L_foot = L_leg * (36 / 45);
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
