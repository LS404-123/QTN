export class TrajectoryTracker {
    constructor(maxPoints = 400) {
        this.maxPoints = maxPoints;
        this.history = []; // 將儲存各腳的世界座標點
        this.showTrajectory = false;
    }

    // 綁定 UI 控制元素
    bindUI(checkboxId, clearBtnId, updateCallback) {
        const checkbox = document.getElementById(checkboxId);
        if (checkbox) {
            checkbox.checked = this.showTrajectory;
            checkbox.addEventListener('change', (e) => {
                this.showTrajectory = e.target.checked;
                if (updateCallback) updateCallback();
            });
        }

        const clearBtn = document.getElementById(clearBtnId);
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.clear();
                if (updateCallback) updateCallback();
            });
        }
    }

    // 傳入 local feet 資料，內部處理世界座標轉換與記錄條件
    record(allFeetLocal, bodyX, bodyY, bodyRoll, isPlaying, bodyVelX) {
        if (!this.showTrajectory || (!isPlaying && Math.abs(bodyVelX) <= 0.1)) {
            return; // 沒開啟顯示或機器人沒在動時不記錄
        }

        if (this.history.length === 0) {
            for (let i = 0; i < allFeetLocal.length; i++) {
                this.history.push([]);
            }
        }

        const cosR = Math.cos(bodyRoll);
        const sinR = Math.sin(bodyRoll);

        for (let i = 0; i < allFeetLocal.length; i++) {
            const f = allFeetLocal[i];
            const worldX = bodyX + f.tip_x * cosR - f.tip_y * sinR;
            const worldY = bodyY + f.tip_x * sinR + f.tip_y * cosR;

            this.history[i].push({ x: worldX, y: worldY });
            
            if (this.history[i].length > this.maxPoints) {
                this.history[i].shift();
            }
        }
    }

    render(ctx, cameraX, scale, cx, targetGy) {
        if (!this.showTrajectory) return;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2.5;

        // 設定六隻腳的軌跡顏色 (對應 Near F, M, R; Far F, M, R)
        const colors = [
            'rgba(239, 68, 68, 0.8)',   // Near Front (紅)
            'rgba(16, 185, 129, 0.8)',  // Near Middle (綠)
            'rgba(59, 130, 246, 0.8)',  // Near Rear (藍)
            'rgba(248, 113, 113, 0.3)', // Far Front (淡紅)
            'rgba(52, 211, 153, 0.3)',  // Far Middle (淡綠)
            'rgba(96, 165, 250, 0.3)'   // Far Rear (淡藍)
        ];

        for (let i = 0; i < this.history.length; i++) {
            const points = this.history[i];
            if (points.length < 2) continue;

            ctx.strokeStyle = colors[i % colors.length];
            ctx.beginPath();
            for (let j = 0; j < points.length; j++) {
                const pt = points[j];
                // 世界座標轉螢幕座標，包含相機跟隨
                const sx = cx + (pt.x - cameraX) * scale;
                const sy = targetGy - pt.y * scale;

                if (j === 0) {
                    ctx.moveTo(sx, sy);
                } else {
                    ctx.lineTo(sx, sy);
                }
            }
            ctx.stroke();
        }
        ctx.restore();
    }

    clear() {
        this.history = [];
    }
}
