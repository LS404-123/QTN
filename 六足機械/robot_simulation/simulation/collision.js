export function closestPointOnSegment(p, v, w) {
    const l2 = (w.x - v.x) * (w.x - v.x) + (w.y - v.y) * (w.y - v.y);
    if (l2 === 0) return { x: v.x, y: v.y };
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
}

export function distPointToSegment(p, v, w) {
    const closest = closestPointOnSegment(p, v, w);
    return Math.sqrt((p.x - closest.x) * (p.x - closest.x) + (p.y - closest.y) * (p.y - closest.y));
}

export function segmentIntersection(p1, p2, p3, p4) {
    const denominator = (p4.y - p3.y)*(p2.x - p1.x) - (p4.x - p3.x)*(p2.y - p1.y);
    if (denominator === 0) return null;
    const ua = ((p4.x - p3.x)*(p1.y - p3.y) - (p4.y - p3.y)*(p1.x - p3.x)) / denominator;
    const ub = ((p2.x - p1.x)*(p1.y - p3.y) - (p2.y - p1.y)*(p1.x - p3.x)) / denominator;
    if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
        return {
            x: p1.x + ua * (p2.x - p1.x),
            y: p1.y + ua * (p2.y - p1.y)
        };
    }
    return null;
}

export function getCollisionPoint(p1, p2, p3, p4) {
    const intersection = segmentIntersection(p1, p2, p3, p4);
    if (intersection) return intersection;

    let minD = Infinity;
    let pt = null;

    const check = (p, A, B) => {
        const closest = closestPointOnSegment(p, A, B);
        const d = Math.sqrt((p.x - closest.x)**2 + (p.y - closest.y)**2);
        if (d < minD) {
            minD = d;
            pt = { x: (p.x + closest.x)/2, y: (p.y + closest.y)/2 };
        }
    };

    check(p1, p3, p4);
    check(p2, p3, p4);
    check(p3, p1, p2);
    check(p4, p1, p2);

    return pt;
}

export function distSegmentToSegment(p1, p2, p3, p4) {
    if (segmentIntersection(p1, p2, p3, p4)) return 0;
    
    return Math.min(
        distPointToSegment(p1, p3, p4),
        distPointToSegment(p2, p3, p4),
        distPointToSegment(p3, p1, p2),
        distPointToSegment(p4, p1, p2)
    );
}

export function checkLegCollision(leg1, leg2, globalScale) {
    // 根據 renderer.js 的縮放邏輯，SVG 被縮放了 (25 * globalScale) / 45
    const rendererScale = (25.0 * globalScale) / 45.0;
    const r_upper = 9 * rendererScale; // 大腿半徑
    const r_foot_x = 24.5 * rendererScale; // 腳掌橢圓水平半徑
    const r_foot_y = 13 * rendererScale; // 腳掌橢圓垂直半徑

    // 計算腳掌膠囊體 (Capsule) 的兩個端點，用來完美近似橢圓
    const getFootCapsule = (leg) => {
        const dx = leg.foot.cx - leg.top.x;
        const dy = leg.foot.cy - leg.top.y;
        const len = Math.sqrt(dx*dx + dy*dy);
        const nx = -dy / len; // 垂直於腿部軸線的法向量 X
        const ny = dx / len;  // 垂直於腿部軸線的法向量 Y
        
        // 為了讓膠囊體的總寬度等於 2 * r_foot_x，端點需向內縮 r_foot_y
        const extent = Math.max(0, r_foot_x - r_foot_y);
        return {
            p1: { x: leg.foot.cx + nx * extent, y: leg.foot.cy + ny * extent },
            p2: { x: leg.foot.cx - nx * extent, y: leg.foot.cy - ny * extent },
            r: r_foot_y
        };
    };

    const foot1 = getFootCapsule(leg1);
    const foot2 = getFootCapsule(leg2);
    
    // 1. 檢查 腳掌 vs 腳掌 (Capsule vs Capsule)
    const distFootFoot = distSegmentToSegment(foot1.p1, foot1.p2, foot2.p1, foot2.p2);
    if (distFootFoot < foot1.r + foot2.r) {
        return { collided: true, pt: getCollisionPoint(foot1.p1, foot1.p2, foot2.p1, foot2.p2) };
    }

    // 2. 檢查 大腿 vs 大腿 (Capsule vs Capsule)
    const p1_top = leg1.top;
    const p1_foot_center = { x: leg1.foot.cx, y: leg1.foot.cy };
    const p2_top = leg2.top;
    const p2_foot_center = { x: leg2.foot.cx, y: leg2.foot.cy };

    const distUpperUpper = distSegmentToSegment(p1_top, p1_foot_center, p2_top, p2_foot_center);
    if (distUpperUpper < r_upper * 2) {
        return { collided: true, pt: getCollisionPoint(p1_top, p1_foot_center, p2_top, p2_foot_center) };
    }

    // 3. 檢查 腳掌 vs 對方大腿 (Capsule vs Capsule)
    const distFoot1Upper2 = distSegmentToSegment(foot1.p1, foot1.p2, p2_top, p2_foot_center);
    if (distFoot1Upper2 < foot1.r + r_upper) {
        return { collided: true, pt: getCollisionPoint(foot1.p1, foot1.p2, p2_top, p2_foot_center) };
    }

    const distFoot2Upper1 = distSegmentToSegment(foot2.p1, foot2.p2, p1_top, p1_foot_center);
    if (distFoot2Upper1 < foot2.r + r_upper) {
        return { collided: true, pt: getCollisionPoint(foot2.p1, foot2.p2, p1_top, p1_foot_center) };
    }

    return { collided: false };
}
