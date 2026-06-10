
let bodyX = 0, bodyY = 0, bodyRoll = 0, lockedPivotIndex = -1, pivotWorldX = 0;
let simSpeed = 0.1, phaseDiff = 0, globalScale = 1.5;
let L_leg = 25.0 * globalScale, L_blue = 55.0 * globalScale, L_foot = 20.0 * globalScale, S = 48.0 * globalScale;
let Pf = { x: -S, y: 0 }, Pr = { x: S, y: 0 };
let C_crank = { x: 0, y: -8.0 * globalScale + 2 + 12.5 };
let R = 6.5;

function getIntersection(C1, r1, C2, r2) {
    const dx = C2.x - C1.x, dy = C2.y - C1.y;
    const d = Math.sqrt(dx*dx + dy*dy);
    if (d > r1+r2 || d < Math.abs(r1-r2) || d === 0) return null;
    const a = (r1*r1 - r2*r2 + d*d) / (2*d);
    const h = Math.sqrt(Math.max(0, r1*r1 - a*a));
    const P2x = C1.x + a*dx/d, P2y = C1.y + a*dy/d;
    const P3a = { x: P2x - h*dy/d, y: P2y + h*dx/d };
    const P3b = { x: P2x + h*dy/d, y: P2y - h*dx/d };
    return (P3a.y > P3b.y) ? P3a : P3b;
}

function getEllipticFootPoint(P_top, P_bottom, m=0) {
    const dx = P_bottom.x - P_top.x, dy = P_bottom.y - P_top.y;
    const L_curr = Math.sqrt(dx*dx + dy*dy);
    if (L_curr === 0) return P_bottom;
    const centerDist = L_foot - 13 * (25/45) - 2.457 + 0.2 * globalScale;
    return { x: P_bottom.x + (dx/L_curr)*centerDist, y: P_bottom.y + (dy/L_curr)*centerDist };
}

function getLegPositions(angle, groundM = 0) {
    const ML = { x: C_crank.x + R * Math.cos(angle), y: C_crank.y + R * Math.sin(angle) };
    const MT = getIntersection(ML, L_leg, Pf, L_blue);
    const FT = getIntersection(Pf, L_leg, ML, L_blue);
    const RT = getIntersection(Pr, L_leg, ML, L_blue);
    if (!MT || !FT || !RT) return null;
    return { ML, MT, FT, RT, foot_f: getEllipticFootPoint(FT, Pf, groundM), foot_m: getEllipticFootPoint(MT, ML, groundM), foot_r: getEllipticFootPoint(RT, Pr, groundM) };
}

for (let step=0; step<10; step++) {
    let currentTheta = step * 0.1;
    let near = getLegPositions(currentTheta, 0);
    let far = getLegPositions(currentTheta + phaseDiff, 0);
    let allFeetLocal = [near.foot_f, near.foot_m, near.foot_r, far.foot_f, far.foot_m, far.foot_r];
    
    let bestY = -Infinity;
    let bestRoll = 0;
    let bestPair = null;

    for (let i = 0; i < 6; i++) {
        for (let j = i + 1; j < 6; j++) {
            const p1 = allFeetLocal[i];
            const p2 = allFeetLocal[j];
            if (Math.abs(p1.x - p2.x) < 5.0) continue;
            const roll = Math.atan2(p2.y - p1.y, p1.x - p2.x);
            const tempY = -(p1.x * Math.sin(roll) + p1.y * Math.cos(roll));
            let isValid = true;
            for (let k = 0; k < 6; k++) {
                const pk = allFeetLocal[k];
                const y_world_k = tempY + pk.x * Math.sin(roll) + pk.y * Math.cos(roll);
                if (y_world_k < -0.1) {
                    isValid = false;
                    break;
                }
            }
            if (isValid && tempY > bestY) {
                bestY = tempY;
                bestRoll = roll;
                bestPair = [i, j];
            }
        }
    }
    if (bestPair === null) {
        bestRoll = 0;
        bestY = -Math.min(...allFeetLocal.map(f => f.y));
    }
    bodyY = bestY;
    bodyRoll = bestRoll;

    const groundedIndices = bestPair !== null ? bestPair : [];

    if (groundedIndices.length > 0 && !groundedIndices.includes(lockedPivotIndex)) {
        let bestPivot = groundedIndices[0];
        let minAbsX = Math.abs(allFeetLocal[bestPivot].x);
        for (let idx of groundedIndices) {
            if (Math.abs(allFeetLocal[idx].x) < minAbsX) {
                minAbsX = Math.abs(allFeetLocal[idx].x);
                bestPivot = idx;
            }
        }
        lockedPivotIndex = bestPivot;
        const px = allFeetLocal[lockedPivotIndex].x;
        const py = allFeetLocal[lockedPivotIndex].y;
        pivotWorldX = bodyX + px * Math.cos(bodyRoll) - py * Math.sin(bodyRoll);
    }

    if (lockedPivotIndex !== -1) {
        const px = allFeetLocal[lockedPivotIndex].x;
        const py = allFeetLocal[lockedPivotIndex].y;
        bodyX = pivotWorldX - (px * Math.cos(bodyRoll) - py * Math.sin(bodyRoll));
    }
    console.log("Step", step, "Theta", currentTheta.toFixed(2), "bodyX", bodyX.toFixed(2), "locked", lockedPivotIndex, "bestPair", bestPair);
}
