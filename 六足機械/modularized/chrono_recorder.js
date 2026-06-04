/**
 * Chronophotography Recorder for Gait Analysis
 */
export class ChronoRecorder {
    /**
     * @param {number} canvasWidth - Width of the output image
     * @param {number} canvasHeight - Height of the output image
     * @param {number} framesPerCycle - How many frames to capture per 360-degree cycle (determines degree interval)
     */
    constructor(canvasWidth, canvasHeight, framesPerCycle = 5) {
        this.isRecording = false;
        this.chronoCanvas = document.createElement('canvas');
        this.chronoCanvas.width = canvasWidth;
        this.chronoCanvas.height = canvasHeight;
        this.chronoCtx = this.chronoCanvas.getContext('2d');
        
        this.frameCount = 0;
        this.maxFrames = framesPerCycle;
        // e.g. 360 / 5 = 72 degrees per capture
        this.targetThetaInterval = (Math.PI * 2) / this.maxFrames; 
        
        this.cachedImage = null;
        this.cachedParamSignature = null;
    }

    start(currentParamsJson, currentCameraX, currentTheta, isPlaying) {
        return new Promise((resolve) => {
            // Caching Mechanism: Return immediately if parameters are unchanged
            if (this.cachedImage && this.cachedParamSignature === currentParamsJson && isPlaying) {
                resolve(this.cachedImage);
                return;
            }

            // Initialization for a new recording
            this.chronoCtx.fillStyle = '#1e1e1e';
            this.chronoCtx.fillRect(0, 0, this.chronoCanvas.width, this.chronoCanvas.height);
            
            this.initialCameraX = currentCameraX; 
            this.lastCaptureTheta = currentTheta;
            this.accumulatedTheta = 0;
            this.frameCount = 0;
            this.currentParamsJson = currentParamsJson;
            this.resolvePromise = resolve;
            this.isRecording = true;
        });
    }

    captureFrameHook(currentTheta, robotCanvas, cameraX, scale) {
        if (!this.isRecording) return;

        let dTheta = Math.abs(currentTheta - this.lastCaptureTheta);
        if (dTheta > Math.PI) dTheta = (Math.PI * 2) - dTheta; // Wrap around

        this.accumulatedTheta += dTheta;
        this.lastCaptureTheta = currentTheta;

        // Take snapshot every target interval
        if (this.accumulatedTheta >= this.targetThetaInterval) {
            this.accumulatedTheta -= this.targetThetaInterval;
            this.doCapture(robotCanvas, cameraX, scale);
        }
    }

    doCapture(robotCanvas, cameraX, scale) {
        // Unroll the treadmill effect by applying the camera's moved distance
        const scaleOffset = (cameraX - this.initialCameraX) * scale;
        
        this.chronoCtx.save();
        // Alpha increases from 0.3 (oldest) to 0.9 (newest)
        this.chronoCtx.globalAlpha = 0.3 + (this.frameCount * (0.6 / this.maxFrames)); 
        this.chronoCtx.drawImage(robotCanvas, scaleOffset, 0);
        this.chronoCtx.restore();

        this.frameCount++;
        if (this.frameCount >= this.maxFrames) {
            this.stopAndSend();
        }
    }

    stopAndSend() {
        this.isRecording = false;
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
