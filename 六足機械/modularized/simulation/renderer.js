import { rodSVGPath, gearboxSVGPath, crankSVGPath, motorSVGPath } from './svgs.js';

export class HexapodRenderer {
    constructor(ctx, offCtx, robotCtx, canvas) {
        this.ctx = ctx;
        this.offCtx = offCtx;
        this.robotCtx = robotCtx;
        this.canvas = canvas;

        // Gearbox Colors
        this.gearboxFill = '#8a8d91';
        this.gearboxStroke = '#fdfbf7';
        this.gearboxAnnulusFill = '#808082';
        this.gearboxHoleFill = '#000000';

        // Motor Colors
        this.motorLightGrey = '#e5e5e5';
        this.motorMediumGrey = '#bbbbbb';
        this.motorDarkGrey = '#7a7a7a';
        this.motorBronze = '#cd7f32';
        this.motorBronzeStroke = '#8b4513';
    }

    mapCoords(p, state) {
        const cosR = Math.cos(state.bodyRoll);
        const sinR = Math.sin(state.bodyRoll);
        const rx = p.x * cosR - p.y * sinR;
        const ry = state.bodyY + p.x * sinR + p.y * cosR;
        return { 
            x: state.cx + (state.bodyX - state.cameraX + rx) * state.scale, 
            y: state.targetGy - ry * state.scale 
        };
    }

    drawSVGLink(p1, p2, svgPath, h1x, h1y, h2x, h2y, strokeColor, fillColor, isFar, targetCtx, state, customScaleX = null) {
        if (!p1 || !p2 || !svgPath) return;
        const m1 = this.mapCoords(p1, state), m2 = this.mapCoords(p2, state);
        const dx = m2.x - m1.x, dy = m2.y - m1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const svgDist = Math.sqrt(Math.pow(h2x - h1x, 2) + Math.pow(h2y - h1y, 2));
        const scaleY = dist / svgDist;
        const scaleX = customScaleX !== null ? customScaleX : scaleY;
        const angle = Math.atan2(dy, dx);
        const svgAngle = Math.atan2(h2y - h1y, h2x - h1x);

        targetCtx.save();
        targetCtx.translate(m1.x, m1.y);
        targetCtx.rotate(angle - svgAngle);
        targetCtx.scale(scaleX, scaleY);
        targetCtx.translate(-h1x, -h1y);

        targetCtx.globalAlpha = 1.0;
        targetCtx.strokeStyle = strokeColor;
        targetCtx.lineWidth = 1.5 / scaleX;
        if (fillColor) {
            targetCtx.fillStyle = fillColor;
            targetCtx.fill(svgPath);
        }
        targetCtx.stroke(svgPath);
        targetCtx.restore();
    }

    drawLine(p1, p2, color, width, targetCtx, state) {
        if (!p1 || !p2) return;
        const m1 = this.mapCoords(p1, state), m2 = this.mapCoords(p2, state);
        targetCtx.beginPath();
        targetCtx.moveTo(m1.x, m1.y);
        targetCtx.lineTo(m2.x, m2.y);
        targetCtx.strokeStyle = color;
        targetCtx.lineWidth = width;
        targetCtx.lineCap = 'round';
        targetCtx.stroke();
    }

    drawProceduralRod(p1, p2, strokeColor, fillColor, targetCtx, state, customScaleX) {
        if (!p1 || !p2) return;
        const m1 = this.mapCoords(p1, state), m2 = this.mapCoords(p2, state);
        const dx = m2.x - m1.x, dy = m2.y - m1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);

        const r = 5 * customScaleX;
        const rHole = 1.5 * customScaleX;

        targetCtx.save();
        targetCtx.translate(m1.x, m1.y);
        targetCtx.rotate(angle - Math.PI / 2);

        targetCtx.beginPath();
        targetCtx.arc(0, 0, r, Math.PI, 0);
        targetCtx.lineTo(r, dist);
        targetCtx.arc(0, dist, r, 0, Math.PI);
        targetCtx.closePath();

        targetCtx.globalAlpha = 1.0;
        targetCtx.strokeStyle = strokeColor;
        targetCtx.lineWidth = 1.5;
        if (fillColor) {
            targetCtx.fillStyle = fillColor;
            targetCtx.fill();
        }
        targetCtx.stroke();

        targetCtx.beginPath();
        targetCtx.arc(0, 0, rHole, 0, Math.PI * 2);
        targetCtx.stroke();

        targetCtx.beginPath();
        targetCtx.arc(0, dist, rHole, 0, Math.PI * 2);
        targetCtx.stroke();

        targetCtx.restore();
    }

    drawPoint(p, color, radius, targetCtx, state) {
        if (!p) return;
        const mp = this.mapCoords(p, state);
        targetCtx.beginPath();
        targetCtx.arc(mp.x, mp.y, radius, 0, Math.PI * 2);
        targetCtx.fillStyle = color;
        targetCtx.fill();
    }

    renderSide(data, isFar, targetCtx, state) {
        const jointColor = isFar ? '#334155' : '#1e293b';
        const widthScale = isFar ? 0.8 : 1.0;

        const drawCrank = () => {
            const crankFill = isFar ? '#f1f5f9' : '#e2e8f0';
            const crankStroke = isFar ? '#cbd5e1' : '#94a3b8';
            if (typeof crankSVGPath !== 'undefined') {
                this.drawSVGLink(state.C_crank, data.ML, crankSVGPath, 8.7, 8.7, 8.7, state.currentCrankHoleY, crankStroke, crankFill, isFar, targetCtx, state);
            } else {
                const crankColor = isFar ? '#e2e8f0' : '#cbd5e1';
                this.drawLine(state.C_crank, data.ML, crankColor, 4 * widthScale, targetCtx, state);
            }
        };

        const drawRods = () => {
            const rodFill = isFar ? '#93c5fd' : '#3b82f6';
            const rodStroke = isFar ? '#60a5fa' : '#1d4ed8';
            const rodNominalScaleX = (55.0 * state.globalScale * state.scale) / 92.0;
            if (isFar) {
                this.drawProceduralRod(data.FT, data.ML, rodStroke, rodFill, targetCtx, state, rodNominalScaleX);
                this.drawProceduralRod(state.Pf, data.MT, rodStroke, rodFill, targetCtx, state, rodNominalScaleX);
                this.drawProceduralRod(data.ML, data.RT, rodStroke, rodFill, targetCtx, state, rodNominalScaleX);
            } else {
                this.drawProceduralRod(data.ML, data.RT, rodStroke, rodFill, targetCtx, state, rodNominalScaleX);
                this.drawProceduralRod(state.Pf, data.MT, rodStroke, rodFill, targetCtx, state, rodNominalScaleX);
                this.drawProceduralRod(data.FT, data.ML, rodStroke, rodFill, targetCtx, state, rodNominalScaleX);
            }
        };

        const drawLegs = () => {
            const overlaps = isFar ? state.legOverlaps?.far : state.legOverlaps?.near;
            const isColliding = (name) => {
                if (!overlaps) return false;
                return overlaps.some(o => o.leg1.name === name || o.leg2.name === name);
            };

            const getColors = (name) => {
                if (isColliding(name)) {
                    return { fill: '#fecaca', stroke: '#ef4444' }; // Red highlight
                }
                return { 
                    fill: isFar ? '#fef08a' : '#facc15',
                    stroke: isFar ? '#fde047' : '#b45309'
                };
            };

            const colorF = getColors('F');
            this.drawSVGLink(data.FT, state.Pf, state.legSVGPath, 30, 20, 30, state.legSVG_h2y, colorF.stroke, colorF.fill, isFar, targetCtx, state);
            
            const colorM = getColors('M');
            this.drawSVGLink(data.MT, data.ML, state.legSVGPath, 30, 20, 30, state.legSVG_h2y, colorM.stroke, colorM.fill, isFar, targetCtx, state);
            
            const colorR = getColors('R');
            this.drawSVGLink(data.RT, state.Pr, state.legSVGPath, 30, 20, 30, state.legSVG_h2y, colorR.stroke, colorR.fill, isFar, targetCtx, state);

            if (state.showHitbox) {
                const drawHitbox = (legData) => {
                    const top = legData.top;
                    const foot = legData.foot;
                    const footCenter = { x: foot.cx, y: foot.cy };
                    const rendererScale = (25.0 * state.globalScale) / 45.0;
                    const r_upper = 9 * rendererScale;
                    const r_foot_x = 24.5 * rendererScale;
                    const r_foot_y = 13 * rendererScale;

                    // Draw Upper Leg Capsule
                    const mTop = this.mapCoords(top, state);
                    const mFootCenter = this.mapCoords(footCenter, state);
                    const dx = foot.cx - top.x;
                    const dy = foot.cy - top.y;
                    const len = Math.sqrt(dx*dx + dy*dy);
                    const nx = -dy / len;
                    const ny = dx / len;
                    
                    targetCtx.beginPath();
                    targetCtx.moveTo(mTop.x, mTop.y);
                    targetCtx.lineTo(mFootCenter.x, mFootCenter.y);
                    targetCtx.strokeStyle = isFar ? 'rgba(0, 255, 0, 0.2)' : 'rgba(0, 255, 0, 0.5)';
                    targetCtx.lineWidth = r_upper * 2 * state.scale;
                    targetCtx.lineCap = 'round';
                    targetCtx.stroke();

                    // Draw Foot Capsule
                    const extent = Math.max(0, r_foot_x - r_foot_y);
                    const p1 = { x: foot.cx + nx * extent, y: foot.cy + ny * extent };
                    const p2 = { x: foot.cx - nx * extent, y: foot.cy - ny * extent };
                    const mP1 = this.mapCoords(p1, state);
                    const mP2 = this.mapCoords(p2, state);

                    targetCtx.beginPath();
                    targetCtx.moveTo(mP1.x, mP1.y);
                    targetCtx.lineTo(mP2.x, mP2.y);
                    targetCtx.strokeStyle = isFar ? 'rgba(255, 0, 255, 0.2)' : 'rgba(255, 0, 255, 0.5)';
                    targetCtx.lineWidth = r_foot_y * 2 * state.scale;
                    targetCtx.lineCap = 'round';
                    targetCtx.stroke();
                };

                drawHitbox({ top: data.FT, foot: data.foot_f });
                drawHitbox({ top: data.MT, foot: data.foot_m });
                drawHitbox({ top: data.RT, foot: data.foot_r });
            }
        };

        if (isFar) {
            drawRods();
            drawLegs();
            drawCrank();
        } else {
            drawCrank();
            drawLegs();
            drawRods();
        }

        this.drawPoint(data.ML, jointColor, 4 * widthScale, targetCtx, state);
        this.drawPoint(data.FT, jointColor, 4 * widthScale, targetCtx, state);
        this.drawPoint(data.MT, jointColor, 4 * widthScale, targetCtx, state);
        this.drawPoint(data.RT, jointColor, 4 * widthScale, targetCtx, state);
    }

    drawFootShadow(footLocal, state) {
        const visualPos = this.mapCoords(footLocal, state);
        const distPx = state.targetGy - visualPos.y;
        const dist = Math.max(0, distPx / state.scale);
        const maxDist = 35 * state.globalScale;
        const opacity = Math.max(0, 0.25 * (1 - dist / maxDist));
        if (opacity <= 0) return;

        const baseWidth = 14 * state.scale;
        const baseHeight = 4 * state.scale;
        const sizeMult = 1 - (dist / maxDist) * 0.4;
        const width = baseWidth * sizeMult;
        const height = baseHeight * sizeMult;

        this.ctx.save();
        this.ctx.translate(visualPos.x, state.targetGy);
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
        this.ctx.fill();
        this.ctx.restore();
    }

    drawOverlayStats(state) {
        const { ctx, canvas } = this;
        const w = 260;
        const h = 255; 
        const x = canvas.width - w - 20;
        const y = 20;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, 12);
            ctx.fill();
        } else {
            ctx.fillRect(x, y, w, h);
        }

        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(x, y + 10, 4, h - 20);

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 15px system-ui';
        ctx.textAlign = 'left';
        ctx.fillText('單腳觸地推進數據', x + 20, y + 35);

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

        drawRow('每圈前進距離:', `${state.displayDist.toFixed(1)} mm`, '#38bdf8', y + 68);
        drawRow('每秒前進速度 (MAV):', `${state.displaySpeed.toFixed(1)} mm/s`, '#34d399', y + 93);
        drawRow('十週期待均速 (10-avg):', `${state.displayAvg10Speed.toFixed(1)} mm/s`, state.isAvgSpeedStable ? '#10b981' : '#ef4444', y + 118);
        drawRow('地面支撐狀態:', state.isStableSupport ? '穩定支撐' : '失去平衡', state.isStableSupport ? '#10b981' : '#ef4444', y + 143);
        drawRow('COM 重心起伏:', `${state.comVerticalChange_Display.toFixed(1)} mm`, '#facc15', y + 168);

        ctx.textAlign = 'left';
        ctx.font = 'bold 13px system-ui';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText('觸地狀態 (綠:觸地/灰:懸空)', x + 20, y + 192);

        const startY = y + 212;
        const startY2 = y + 232;

        const drawIndicator = (idx, label, px, py) => {
            const isGrounded = state.lastGroundedIndices.includes(idx);
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

    renderScene(state) {
        const { ctx, offCtx, robotCtx, canvas } = this;
        
        const {
            near, far, allFeetLocal, bodyRoll, bodyX, bodyY, scale, targetGy, cx,
            AdminController, robotCanvas, offscreenCanvas,
            Pf, Pr, C_crank, gearboxShiftX, bodyYOffset, S,
            showGroundline, showFriction, validLines, invalidCOMLines, groundLine,
            footStates, lastGroundedIndices, globalScale
        } = state;

        if (near && far) {
            allFeetLocal.forEach(f => this.drawFootShadow(f, state));

            ctx.beginPath();
            ctx.moveTo(0, targetGy);
            ctx.lineTo(canvas.width, targetGy);
            ctx.strokeStyle = AdminController.getStrokeColor();
            ctx.lineWidth = 3;
            ctx.stroke();

            offCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
            this.renderSide(far, true, offCtx, state);

            robotCtx.clearRect(0, 0, robotCanvas.width, robotCanvas.height);

            robotCtx.save();
            robotCtx.globalAlpha = 0.75;
            robotCtx.drawImage(offscreenCanvas, 0, 0);
            robotCtx.restore();

            const bodyYLocal = -bodyYOffset;
            const connection_width = 12;
            this.drawLine(Pf, { x: Pf.x, y: bodyYLocal }, '#64748b', connection_width, robotCtx, state);
            this.drawLine(Pr, { x: Pr.x, y: bodyYLocal }, '#64748b', connection_width, robotCtx, state);

            const bodyCenterPos = this.mapCoords({ x: gearboxShiftX, y: bodyYLocal }, state);
            const bp1 = this.mapCoords({ x: -S, y: bodyYLocal }, state);
            const bp2 = this.mapCoords({ x: S, y: bodyYLocal }, state);
            const bodyAngle = Math.atan2(bp2.y - bp1.y, bp2.x - bp1.x);
            const customGearboxScale = (bodyYOffset * scale - 6) / 12.5;

            robotCtx.save();
            robotCtx.translate(bodyCenterPos.x, bodyCenterPos.y);
            robotCtx.rotate(bodyAngle);
            robotCtx.scale(customGearboxScale, customGearboxScale);

            // Draw motor
            robotCtx.save();
            robotCtx.translate(27.0, -24.5);
            robotCtx.fillStyle = this.motorLightGrey;
            robotCtx.fillRect(0, 0, 10.5, 4);
            robotCtx.fillRect(0, 16, 10.5, 4);
            robotCtx.fillStyle = this.motorMediumGrey;
            robotCtx.fillRect(0, 4, 10.5, 12);
            robotCtx.fillStyle = '#ffffff';
            robotCtx.fillRect(10.5, 0, 5, 20);
            robotCtx.fillStyle = this.motorDarkGrey;
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
                robotCtx.fillStyle = this.motorBronze;
                robotCtx.strokeStyle = this.motorBronzeStroke;
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

            // Draw gearbox
            robotCtx.save();
            robotCtx.translate(-25.0, -27);
            robotCtx.fillStyle = this.gearboxFill;
            robotCtx.strokeStyle = this.gearboxStroke;
            robotCtx.lineWidth = 1.5 / customGearboxScale;
            if (typeof gearboxSVGPath !== 'undefined') {
                robotCtx.fill(gearboxSVGPath);
                robotCtx.stroke(gearboxSVGPath);
            }
            const drawHoleDetail = (hcx, hcy) => {
                robotCtx.beginPath(); robotCtx.arc(hcx, hcy, 3.5, 0, Math.PI * 2);
                robotCtx.fillStyle = this.gearboxAnnulusFill; robotCtx.fill(); robotCtx.stroke();
                robotCtx.beginPath(); robotCtx.arc(hcx, hcy, 1.5, 0, Math.PI * 2);
                robotCtx.fillStyle = this.gearboxHoleFill; robotCtx.fill(); robotCtx.stroke();
            };
            drawHoleDetail(11.5, 12.5);
            drawHoleDetail(25.0, 12.5);
            robotCtx.restore();

            robotCtx.restore();

            this.drawLine({ x: -S - 15, y: bodyYLocal }, { x: S + 15, y: bodyYLocal }, '#94a3b8', 12, robotCtx, state);
            this.drawPoint(Pf, '#0f172a', 6, robotCtx, state);
            this.drawPoint(Pr, '#0f172a', 6, robotCtx, state);
            this.drawPoint(C_crank, '#ef4444', 7, robotCtx, state);

            this.renderSide(near, false, robotCtx, state);

            if (state.trajectoryTracker) {
                state.trajectoryTracker.render(ctx, state.cameraX, scale, cx, targetGy);
            }

            ctx.drawImage(robotCanvas, 0, 0);

            // Draw Collision Markers
            if (state.legOverlaps) {
                const drawCollisionMarker = (pt) => {
                    if (!pt) return;
                    const mp = this.mapCoords(pt, state);
                    ctx.beginPath();
                    ctx.arc(mp.x, mp.y, 8, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(239, 68, 68, 0.8)'; // Red
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    // X marker
                    ctx.beginPath();
                    ctx.moveTo(mp.x - 4, mp.y - 4);
                    ctx.lineTo(mp.x + 4, mp.y + 4);
                    ctx.moveTo(mp.x + 4, mp.y - 4);
                    ctx.lineTo(mp.x - 4, mp.y + 4);
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                };

                state.legOverlaps.far.forEach(o => drawCollisionMarker(o.pt));
                state.legOverlaps.near.forEach(o => drawCollisionMarker(o.pt));
            }

            if (AdminController.overlayAlpha > 0.01) {
                ctx.save();
                ctx.globalAlpha = AdminController.overlayAlpha;
                for (let i = 0; i < 6; i++) {
                    if (lastGroundedIndices.includes(i)) {
                        const f_local = allFeetLocal[i];
                        this.drawPoint(f_local, '#ef4444', 5, ctx, state);
                        const mp = this.mapCoords(f_local, state);
                        ctx.beginPath();
                        ctx.arc(mp.x, mp.y, 10, 0, Math.PI * 2);
                        ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
                        ctx.lineWidth = 2;
                        ctx.stroke();
                    }
                }

                if (showGroundline) {
                    const comLocal = { x: 0, y: -bodyYOffset };
                    const m_com = this.mapCoords(comLocal, state);

                    const isSinglePoint = (validLines.length === 0);
                    const indicatorColor = isSinglePoint ? '#ef4444' : '#10b981';

                    ctx.beginPath();
                    ctx.setLineDash([4, 4]);
                    ctx.moveTo(m_com.x, m_com.y);
                    ctx.lineTo(m_com.x, targetGy);
                    ctx.strokeStyle = indicatorColor;
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                    ctx.setLineDash([]);

                    ctx.beginPath();
                    ctx.arc(m_com.x, targetGy, 4, 0, Math.PI * 2);
                    ctx.fillStyle = indicatorColor;
                    ctx.fill();

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

                    const rx_com = bodyYOffset * Math.sin(bodyRoll);
                    const comX_unit = rx_com / globalScale;
                    ctx.fillStyle = '#0f172a';
                    ctx.font = 'bold 11px system-ui';
                    ctx.textAlign = 'center';
                    ctx.fillText(`COM (x: ${comX_unit.toFixed(2)})`, m_com.x, m_com.y - 12);

                    const rx_near_m = near.foot_m.x * Math.cos(bodyRoll) - near.foot_m.y * Math.sin(bodyRoll);
                    const near_m_x = rx_near_m / globalScale;
                    const mp_near_m = this.mapCoords(near.foot_m, state);
                    ctx.fillStyle = '#b45309';
                    ctx.font = 'bold 10px system-ui';
                    ctx.textAlign = 'center';
                    ctx.fillText(`Near M (x: ${near_m_x.toFixed(2)})`, mp_near_m.x, mp_near_m.y + 15);

                    const rx_far_m = far.foot_m.x * Math.cos(bodyRoll) - far.foot_m.y * Math.sin(bodyRoll);
                    const far_m_x = rx_far_m / globalScale;
                    const mp_far_m = this.mapCoords(far.foot_m, state);
                    ctx.fillStyle = '#475569';
                    ctx.font = 'bold 10px system-ui';
                    ctx.textAlign = 'center';
                    ctx.fillText(`Far M (x: ${far_m_x.toFixed(2)})`, mp_far_m.x, mp_far_m.y - 12);

                    if (groundLine) {
                        const mp1 = this.mapCoords(groundLine.p1, state);
                        const mp2 = this.mapCoords(groundLine.p2, state);
                        const minX = Math.min(mp1.x, mp2.x);
                        const maxX = Math.max(mp1.x, mp2.x);

                        ctx.beginPath();
                        ctx.moveTo(minX, targetGy);
                        ctx.lineTo(maxX, targetGy);
                        ctx.strokeStyle = '#10b981';
                        ctx.lineWidth = 6;
                        ctx.lineCap = 'round';
                        ctx.stroke();

                        ctx.fillStyle = '#10b981';
                        ctx.font = 'bold 11px system-ui';
                        ctx.textAlign = 'center';
                        const midX = (minX + maxX) / 2;
                        ctx.fillText('支撐區間 (包含 COM)', midX, targetGy + 15);
                    } else {
                        invalidCOMLines.forEach((line) => {
                            const mp1 = this.mapCoords(line.p1, state);
                            const mp2 = this.mapCoords(line.p2, state);

                            ctx.beginPath();
                            ctx.moveTo(mp1.x, targetGy);
                            ctx.lineTo(mp2.x, targetGy);
                            ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
                            ctx.lineWidth = 4;
                            ctx.stroke();

                            ctx.beginPath();
                            ctx.arc(mp1.x, targetGy, 3, 0, Math.PI * 2);
                            ctx.fillStyle = '#ef4444';
                            ctx.fill();
                            ctx.beginPath();
                            ctx.arc(mp2.x, targetGy, 3, 0, Math.PI * 2);
                            ctx.fillStyle = '#ef4444';
                            ctx.fill();
                        });

                        ctx.fillStyle = '#ef4444';
                        ctx.font = 'bold 11px system-ui';
                        ctx.textAlign = 'center';
                        ctx.fillText('重心未落在任何兩點支撐區間內！', m_com.x, targetGy + 15);
                        ctx.font = '10px system-ui';
                        ctx.fillText('-> 強制退化為單點支撐 (幾何最低點)', m_com.x, targetGy + 28);
                    }
                }

                if (showFriction) {
                    for (let i = 0; i < 6; i++) {
                        const footState = footStates[i];
                        const f_local = allFeetLocal[i];
                        const mp = this.mapCoords(f_local, state);
                        const yOff = (i >= 3) ? 180 : 45;

                        let mainColor;
                        let dispF = 0, dispMax = 0, dispSlip = 0, dispW = 0, dispSkid = 0;

                        if (footState.isGrounded) {
                            const isSlipping = Math.abs(footState.F_x) >= footState.F_max * 0.99 && footState.F_max > 0;
                            mainColor = isSlipping ? '#ef4444' : '#3b82f6';
                            dispF = Math.abs(footState.F_x);
                            dispMax = footState.F_max;
                            dispSlip = footState.slipDistance;
                            dispSkid = footState.skid;
                            dispW = footState.weight * 100;
                        } else {
                            mainColor = 'rgba(148, 163, 184, 0.5)';
                        }

                        if (footState.isGrounded) {
                            const visualScale = 15.0;
                            const forceVec = footState.F_x * visualScale;

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

                        ctx.fillStyle = mainColor;
                        ctx.font = 'bold 11px system-ui';
                        ctx.textAlign = 'center';

                        ctx.fillText(`F: ${dispF.toFixed(1)} / Max: ${dispMax.toFixed(1)}`, mp.x, mp.y - yOff - 35);
                        
                        const maxSlipLimit = footState.isGrounded ? (footState.F_max / state.footStiffness) : 0;
                        ctx.fillText(`Def: ${Math.abs(dispSlip).toFixed(2)}/${maxSlipLimit.toFixed(2)} | W: ${dispW.toFixed(0)}%`, mp.x, mp.y - yOff - 22);
                        
                        ctx.fillText(`Skid: ${dispSkid.toFixed(2)}`, mp.x, mp.y - yOff - 9);
                    }
                }

                ctx.restore();
            }
            
            if (AdminController.overlayAlpha > 0.01) {
                ctx.save();
                ctx.globalAlpha = AdminController.overlayAlpha;
                this.drawOverlayStats(state);
                ctx.restore();
            }

        } else {
            window.simulationErrorMsg = '幾何約束衝突！請嘗試減小曲柄半徑。';
            ctx.fillStyle = '#f87171';
            ctx.font = 'bold 22px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText(window.simulationErrorMsg, canvas.width / 2, canvas.height / 2);
        }
    }
}
