/**
 * Chronophotography Recorder for Gait Analysis
 */
export class ChronoRecorder {
    /**
     * @param {number} canvasWidth - Width of the output image
     * @param {number} canvasHeight - Height of the output image
     * @param {number} framesPerCycle - How many frames to capture per 360-degree cycle (determines degree interval)
     */
    constructor(canvasWidth, canvasHeight, framesPerCycle = 6) {
        this.isRecording = false;
        this.chronoCanvas = document.createElement('canvas');
        this.chronoCanvas.width = canvasWidth;
        this.chronoCanvas.height = canvasHeight;
        this.chronoCtx = this.chronoCanvas.getContext('2d');
        
        this.frameCount = 0;
        this.maxFrames = framesPerCycle;
        this.defaultMaxFrames = framesPerCycle;
        // e.g. 360 / 6 = 60 degrees per capture
        this.targetThetaInterval = (Math.PI * 2) / this.maxFrames; 
        
        this.cachedImage = null;
        this.cachedParamSignature = null;
        this.isContinuous = false; // Flag to keep recording for debug
        this.frames = []; // Queue to hold snapshots
    }

    start(currentParamsJson, currentCameraX, currentTheta, isPlaying, isContinuous = false, isClashing = false) {
        return new Promise((resolve) => {
            // Caching Mechanism: Return immediately if parameters are unchanged
            if (this.cachedImage && this.cachedParamSignature === currentParamsJson && isPlaying && !isContinuous) {
                resolve(this.cachedImage);
                return;
            }

            // Adjust maxFrames based on clashing state
            if (!isContinuous && isClashing) {
                this.maxFrames = 1;
            } else {
                this.maxFrames = this.defaultMaxFrames;
            }
            this.targetThetaInterval = (Math.PI * 2) / this.maxFrames; 

            // Initialization for a new recording
            this.chronoCtx.fillStyle = '#1e1e1e';
            this.chronoCtx.fillRect(0, 0, this.chronoCanvas.width, this.chronoCanvas.height);
            
            this.initialCameraX = currentCameraX; 
            this.lastCaptureTheta = currentTheta;
            this.accumulatedTheta = 0;
            this.frameCount = 0;
            this.frames = []; // Clear queue
            this.isContinuous = isContinuous;
            this.currentParamsJson = currentParamsJson;
            this.resolvePromise = resolve;
            this.isRecording = true;
        });
    }

    captureFrameHook(currentTheta, robotCanvas, cameraX, scale, targetGy) {
        if (!this.isRecording) return;

        let dTheta = Math.abs(currentTheta - this.lastCaptureTheta);
        if (dTheta > Math.PI) dTheta = (Math.PI * 2) - dTheta; // Wrap around

        this.accumulatedTheta += dTheta;
        this.lastCaptureTheta = currentTheta;

        // Take snapshot every target interval
        if (this.accumulatedTheta >= this.targetThetaInterval) {
            this.accumulatedTheta -= this.targetThetaInterval;
            this.doCapture(robotCanvas, cameraX, scale, targetGy);
        }
    }

    computeBounds(snapshot) {
        const ctx = snapshot.getContext('2d', { willReadFrequently: true });
        const imgData = ctx.getImageData(0, 0, snapshot.width, snapshot.height).data;
        let minX = snapshot.width, maxX = 0, minY = snapshot.height, maxY = 0;
        
        // Scan from top to find minY
        for (let y = 0; y < snapshot.height; y++) {
            let found = false;
            for (let x = 0; x < snapshot.width; x++) {
                if (imgData[(y * snapshot.width + x) * 4 + 3] > 0) {
                    minY = y; found = true; break;
                }
            }
            if (found) break;
        }
        
        // Scan from bottom to find maxY
        for (let y = snapshot.height - 1; y >= 0; y--) {
            let found = false;
            for (let x = 0; x < snapshot.width; x++) {
                if (imgData[(y * snapshot.width + x) * 4 + 3] > 0) {
                    maxY = y; found = true; break;
                }
            }
            if (found) break;
        }

        // Scan from left to find minX
        for (let x = 0; x < snapshot.width; x++) {
            let found = false;
            for (let y = minY; y <= Math.min(maxY, snapshot.height - 1); y++) {
                if (imgData[(y * snapshot.width + x) * 4 + 3] > 0) {
                    minX = x; found = true; break;
                }
            }
            if (found) break;
        }

        // Scan from right to find maxX
        for (let x = snapshot.width - 1; x >= 0; x--) {
            let found = false;
            for (let y = minY; y <= Math.min(maxY, snapshot.height - 1); y++) {
                if (imgData[(y * snapshot.width + x) * 4 + 3] > 0) {
                    maxX = x; found = true; break;
                }
            }
            if (found) break;
        }

        if (minX > maxX) {
            // Empty image fallback
            return { minX: 0, maxX: snapshot.width, minY: 0, maxY: snapshot.height };
        }
        return { minX, maxX, minY, maxY };
    }

    doCapture(robotCanvas, cameraX, scale, targetGy = 0) {
        // Create a snapshot of the current robotCanvas without any camera offset 
        // (we just want the robot in the center of its frame)
        const snapshot = document.createElement('canvas');
        snapshot.width = robotCanvas.width;
        snapshot.height = robotCanvas.height;
        snapshot.getContext('2d').drawImage(robotCanvas, 0, 0);

        const bounds = this.computeBounds(snapshot);
        this.frames.push({ canvas: snapshot, bounds: bounds });
        if (this.frames.length > this.maxFrames) {
            this.frames.shift(); // Shift queue
        }

        // Calculate dynamic global bounds for all current frames
        let globalMinX = snapshot.width, globalMaxX = 0, globalMinY = snapshot.height, globalMaxY = 0;
        for (const frame of this.frames) {
            globalMinX = Math.min(globalMinX, frame.bounds.minX);
            globalMaxX = Math.max(globalMaxX, frame.bounds.maxX);
            globalMinY = Math.min(globalMinY, frame.bounds.minY);
            globalMaxY = Math.max(globalMaxY, frame.bounds.maxY);
        }

        // Add padding to the bounding box
        const padCrop = 20;
        globalMinX = Math.max(0, globalMinX - padCrop);
        globalMaxX = Math.min(snapshot.width, globalMaxX + padCrop);
        globalMinY = Math.max(0, globalMinY - padCrop);
        globalMaxY = Math.min(snapshot.height, globalMaxY + padCrop);

        const cropW = globalMaxX - globalMinX;
        const cropH = globalMaxY - globalMinY;
        const sx = globalMinX;
        const sy = globalMinY;

        // Redraw grid or single image
        this.chronoCtx.fillStyle = '#1e1e1e';
        this.chronoCtx.fillRect(0, 0, this.chronoCanvas.width, this.chronoCanvas.height);
        
        if (this.maxFrames === 1) {
            const innerW = this.chronoCanvas.width;
            const innerH = this.chronoCanvas.height;
            const cellX = 0;
            const cellY = 0;
            
            // Draw dark background
            this.chronoCtx.fillStyle = '#111111';
            this.chronoCtx.fillRect(cellX, cellY, innerW, innerH);

            // Preserve aspect ratio to prevent distortion
            const scale = Math.min(innerW / cropW, innerH / cropH);
            const drawW = cropW * scale;
            const drawH = cropH * scale;

            // Center the image
            const dx = cellX + (innerW - drawW) / 2;
            const dy = cellY + (innerH - drawH) / 2;

            // Draw image preserving aspect ratio
            this.chronoCtx.drawImage(this.frames[0].canvas, sx, sy, cropW, cropH, dx, dy, drawW, drawH);
            
            // Draw Groundline
            if (targetGy > 0) {
                const groundYInCrop = targetGy - sy;
                const scaledTargetGy = dy + groundYInCrop * scale;
                
                this.chronoCtx.beginPath();
                this.chronoCtx.moveTo(cellX, scaledTargetGy);
                this.chronoCtx.lineTo(cellX + innerW, scaledTargetGy);
                this.chronoCtx.strokeStyle = 'rgba(34, 197, 94, 0.8)'; // Green color
                this.chronoCtx.lineWidth = 2;
                this.chronoCtx.stroke();
            }

            // Draw premium alert/warning banner on the image
            this.chronoCtx.save();
            this.chronoCtx.fillStyle = 'rgba(239, 68, 68, 0.85)'; // semi-transparent red
            this.chronoCtx.fillRect(20, 20, 260, 40);
            
            this.chronoCtx.fillStyle = '#ffffff';
            this.chronoCtx.font = 'bold 15px "Inter", sans-serif';
            this.chronoCtx.textAlign = 'left';
            this.chronoCtx.fillText('⚠️ Clash Detected / 機構干涉', 35, 45);
            this.chronoCtx.restore();

        } else {
            const pad = 0;
            const w = this.chronoCanvas.width / 3;
            const h = this.chronoCanvas.height / 2;
            const innerW = w;
            const innerH = h;

            this.chronoCtx.save();
            for (let i = 0; i < this.frames.length; i++) {
                const col = i % 3;
                const row = Math.floor(i / 3);
                const cellX = col * w;
                const cellY = row * h;
                
                // Draw dark background for the inner box
                this.chronoCtx.fillStyle = '#111111';
                this.chronoCtx.fillRect(cellX, cellY, w, h);

                // Preserve aspect ratio to prevent distortion
                const scale = Math.min(innerW / cropW, innerH / cropH);
                const drawW = cropW * scale;
                const drawH = cropH * scale;

                // Center the image inside the padded cell
                const dx = cellX + pad + (innerW - drawW) / 2;
                const dy = cellY + pad + (innerH - drawH) / 2;

                // Draw image preserving aspect ratio
                this.chronoCtx.drawImage(this.frames[i].canvas, sx, sy, cropW, cropH, dx, dy, drawW, drawH);
                
                // Draw Groundline
                if (targetGy > 0) {
                    // Groundline relative to crop is (targetGy - sy). We scale this by our calculated scale.
                    const groundYInCrop = targetGy - sy;
                    const scaledTargetGy = dy + groundYInCrop * scale;
                    
                    this.chronoCtx.beginPath();
                    this.chronoCtx.moveTo(cellX, scaledTargetGy);
                    this.chronoCtx.lineTo(cellX + innerW, scaledTargetGy);
                    this.chronoCtx.strokeStyle = 'rgba(34, 197, 94, 0.8)'; // Green color
                    this.chronoCtx.lineWidth = 2;
                    this.chronoCtx.stroke();
                }

                // Add text tag
                this.chronoCtx.fillStyle = '#ffffff';
                this.chronoCtx.font = '600 14px "Inter", sans-serif';
                this.chronoCtx.fillText(`Frame ${i + 1}`, cellX + 10, cellY + 20);

                // Add grid border
                this.chronoCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                this.chronoCtx.lineWidth = 1;
                this.chronoCtx.strokeRect(cellX, cellY, w, h);
            }
            this.chronoCtx.restore();
        }

        this.frameCount++;
        if (this.frameCount === this.maxFrames) {
            this.sendResult();
            if (!this.isContinuous) {
                this.isRecording = false; // Stop recording if not continuous
            }
        }
    }

    sendResult() {
        // Generate final composite image
        const finalImageBase64 = this.chronoCanvas.toDataURL('image/webp', 0.8);
        
        this.cachedImage = finalImageBase64;
        this.cachedParamSignature = this.currentParamsJson;

        if (this.resolvePromise) {
            this.resolvePromise(finalImageBase64);
            this.resolvePromise = null;
        }
    }
}
