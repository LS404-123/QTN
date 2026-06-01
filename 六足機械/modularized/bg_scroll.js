/**
 * bg_scroll.js - 🏞️ 動態背景滾動引擎 (Vite Raw Mode)
 * 完全對齊 f71e526 版本的座標與參數
 */

import hill2Svg from '../SVG/bg/hill/hill2.svg?raw';
import hill1Svg from '../SVG/bg/hill/hill1.svg?raw';
import ground3Svg from '../SVG/bg/road/ground3.svg?raw';
import ground2Svg from '../SVG/bg/road/ground2.svg?raw';
import ground1Svg from '../SVG/bg/road/ground1.svg?raw';
import sunSvg from '../SVG/bg/sun/sun.svg?raw';
import cloud1Svg from '../SVG/bg/cloud/cloud1.svg?raw';
import cloud2Svg from '../SVG/bg/cloud/cloud2.svg?raw';
import cloud3Svg from '../SVG/bg/cloud/cloud3.svg?raw';
import tree1Svg from '../SVG/bg/tree/tree1.svg?raw';
import tree2Svg from '../SVG/bg/tree/tree2.svg?raw';
import tree3Svg from '../SVG/bg/tree/tree3.svg?raw';

export class BGScroller {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        this.config = {
            speeds: {
                hill2: 0.05,
                hill1: 0.1,
                ground: 0.2,
                cloud: 0.1,
                ...options.speeds
            },
            colors: {
                sky: '#C1E8F9', // 還原舊版天空顏色
                ...options.colors
            },
            limits: {
                maxClouds: 5,
                maxTrees: 12
            }
        };

        this.manualMode = options.manualMode || false;
        this.isInitialized = false;
        this.layers = [];
        this.activeClouds = [];
        this.activeTrees = [];
        this.nextCloudSpacing = 150;
        this.nextTreeSpacing = 120;

        this.init();
    }

    async init() {
        try {
            const svgToImg = (svgText) => new Promise((res, rej) => {
                const img = new Image();
                img.onload = () => res(img);
                img.onerror = rej;
                img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText);
            });

            const [hill2, hill1, ground3, ground2, ground1, sun, c1, c2, c3, t1, t2, t3] = await Promise.all([
                svgToImg(hill2Svg),
                svgToImg(hill1Svg),
                svgToImg(ground3Svg),
                svgToImg(ground2Svg),
                svgToImg(ground1Svg),
                svgToImg(sunSvg),
                svgToImg(cloud1Svg),
                svgToImg(cloud2Svg),
                svgToImg(cloud3Svg),
                svgToImg(tree1Svg),
                svgToImg(tree2Svg),
                svgToImg(tree3Svg)
            ]);

            this.sunImage = sun;
            this.cloudImages = [c1, c2, c3];
            this.treeImages = [t1, t2, t3];

            // 建立背景層 (順序必須與舊版一致)
            this.layers = [
                new BackgroundLayer(hill2, 'hill2', this.config.speeds),
                new BackgroundLayer(hill1, 'hill1', this.config.speeds),
                new BackgroundLayer(ground3, 'ground', this.config.speeds),
                new BackgroundLayer(ground2, 'ground', this.config.speeds),
                new BackgroundLayer(ground1, 'ground', this.config.speeds)
            ];

            const horizon = this.getHorizon();
            const roadTop = this.getRoadTop();
            this.prePopulateClouds(horizon);
            this.prePopulateTrees(horizon, roadTop);

            this.isInitialized = true;
            if (!this.manualMode) this.animate();
            
            console.log("[BGScroller] 背景資源載入成功 (參數已還原)");
        } catch (err) {
            console.error("[BGScroller] 資源載入失敗:", err);
        }
    }

    getGlobalScale() {
        const baseLayer = this.layers.find(l => l.type === 'ground');
        return baseLayer ? this.canvas.width / baseLayer.image.naturalWidth : 1.0;
    }

    getHorizon() {
        const baseLayer = this.layers.find(l => l.type === 'ground');
        if (!baseLayer) return 0.7;
        const hOnCanvas = baseLayer.image.naturalHeight * this.getGlobalScale();
        return 1.0 - (hOnCanvas / this.canvas.height);
    }

    getRoadTop() {
        const roadLayer = this.layers.filter(l => l.type === 'ground')[1];
        if (!roadLayer) return 0.68;
        const hOnCanvas = roadLayer.image.naturalHeight * this.getGlobalScale();
        return 1.0 - (hOnCanvas / this.canvas.height);
    }

    getLayerTop(index) {
        const layer = this.layers[index];
        if (!layer) return 0;
        const { h } = layer.getDimensions(this.getGlobalScale());
        const bottomPercent = (index <= 1) ? this.getHorizon() : 1.0;
        return (this.canvas.height * bottomPercent) - h;
    }

    prePopulateClouds(horizon) {
        for (let i = 0; i < this.config.limits.maxClouds; i++) {
            this.spawnCloud(horizon, true);
        }
    }

    spawnCloud(horizon, randomX = false) {
        if (this.activeClouds.length >= this.config.limits.maxClouds) return;

        // 生成右側雲朵
        const rightmostX = this.activeClouds.reduce((max, c) => Math.max(max, c.x), -1000);
        if (randomX || rightmostX < this.canvas.width - this.nextCloudSpacing) {
            const img = this.cloudImages[Math.floor(Math.random() * this.cloudImages.length)];
            const x = randomX ? Math.random() * this.canvas.width : this.canvas.width + 50;
            const y = -10 + Math.random() * ((horizon * this.canvas.height) * 0.3 + 10);
            const speed = this.config.speeds.cloud * (0.8 + Math.random() * 0.4);
            const scale = 0.4 + Math.random() * 0.5;
            const renderIndex = Math.random() < 0.3 ? 0.5 : 1.5;

            this.activeClouds.push(new MovingEntity(img, x, y, speed, scale, renderIndex));
        }

        // 生成左側雲朵 (當背景往右滾動時)
        const leftmostX = this.activeClouds.reduce((min, c) => Math.min(min, c.x), this.canvas.width + 1000);
        if (!randomX && leftmostX > this.nextCloudSpacing) {
            const img = this.cloudImages[Math.floor(Math.random() * this.cloudImages.length)];
            const x = -200; // 從左側畫面外進入
            const y = -10 + Math.random() * ((horizon * this.canvas.height) * 0.3 + 10);
            const speed = this.config.speeds.cloud * (0.8 + Math.random() * 0.4);
            const scale = 0.4 + Math.random() * 0.5;
            const renderIndex = Math.random() < 0.3 ? 0.5 : 1.5;

            this.activeClouds.push(new MovingEntity(img, x, y, speed, scale, renderIndex));
        }
    }

    prePopulateTrees(horizon, roadTop) {
        const totalGap = roadTop - horizon;
        const activeHorizon = horizon + totalGap * 0.3;
        const activeRoadTop = roadTop - totalGap * 0.1;
        const bandHeight = (activeRoadTop - activeHorizon) / 3;

        for (let i = 0; i < 5; i++) {
            const x = this.canvas.width * i / 5 + 20;
            this.addTree(x, activeHorizon, bandHeight, i % 3);
        }
    }

    spawnTree(horizon) {
        if (this.activeTrees.length >= this.config.limits.maxTrees) return;

        const roadTop = this.getRoadTop();
        const totalGap = roadTop - horizon;
        const bandHeight = (roadTop - totalGap * 0.1 - (horizon + totalGap * 0.3)) / 3;
        const activeHorizon = horizon + totalGap * 0.3;

        // 生成右側樹木
        const rightmostX = this.activeTrees.reduce((max, t) => Math.max(max, t.x), -1000);
        if (rightmostX < this.canvas.width - this.nextTreeSpacing) {
            this.addTree(this.canvas.width + 50, activeHorizon, bandHeight, Math.floor(Math.random() * 3));
        }

        // 生成左側樹木 (當背景往右滾動時)
        const leftmostX = this.activeTrees.reduce((min, t) => Math.min(min, t.x), this.canvas.width + 1000);
        if (leftmostX > this.nextTreeSpacing) {
            this.addTree(-150, activeHorizon, bandHeight, Math.floor(Math.random() * 3));
        }
    }

    addTree(x, activeHorizon, bandHeight, bandIdx) {
        const img = this.treeImages[bandIdx];
        const targetBottom = (activeHorizon + bandIdx * bandHeight) + Math.random() * bandHeight;
        const tree = new MovingEntity(img, x, 0, 0, 1.0, 2.5);
        tree.targetBottomPercent = targetBottom;
        this.activeTrees.push(tree);
    }

    updateSpeed(type, newSpeed) {
        this.config.speeds[type] = newSpeed;
        this.layers.filter(l => l.type === type).forEach(l => l.speed = newSpeed);
    }

    update(deltaX = 0) {
        if (!this.isInitialized) return;
        const horizon = this.getHorizon();

        this.spawnCloud(horizon);
        this.spawnTree(horizon);

        // 雲朵具有微幅的自主左移 + 與機器人位移產生的視差
        this.activeClouds.forEach(c => {
            c.x -= (c.speed + deltaX * 0.15);
        });

        // 樹木與地面完全同步滾動
        this.activeTrees.forEach(t => {
            t.update(deltaX);
        });

        // 更新背景層的滾動位移 (使用 deltaX 代替時間步進速度)
        this.layers.forEach(l => {
            if (l.type === 'ground') {
                l.scrollX += deltaX;
            } else if (l.type === 'hill1') {
                l.scrollX += deltaX * 0.4;
            } else if (l.type === 'hill2') {
                l.scrollX += deltaX * 0.15;
            } else if (l.type === 'cloud') {
                l.scrollX += deltaX * 0.2;
            } else {
                l.scrollX += l.speed;
            }
        });

        const scale = this.getGlobalScale();
        this.activeClouds = this.activeClouds.filter(c => !c.isOffScreen(scale, this.canvas.width));
        this.activeTrees = this.activeTrees.filter(t => !t.isOffScreen(scale, this.canvas.width));
        this.activeTrees.sort((a, b) => a.targetBottomPercent - b.targetBottomPercent);
    }

    render(externalCtx) {
        if (!this.isInitialized) return;
        const ctx = externalCtx || this.ctx;
        const globalScale = this.getGlobalScale();
        const horizon = this.getHorizon();

        ctx.fillStyle = this.config.colors.sky;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.sunImage) {
            const sunW = this.sunImage.naturalWidth * globalScale;
            const sunH = this.sunImage.naturalHeight * globalScale;
            ctx.drawImage(this.sunImage, this.canvas.width - sunW, 0, sunW, sunH);
        }

        this.layers.forEach((layer, i) => {
            const subIndex = i - 0.5;
            this.activeClouds.filter(c => c.renderIndex === subIndex).forEach(c => c.draw(ctx, globalScale));
            this.activeTrees.filter(t => t.renderIndex === subIndex).forEach(t => t.draw(ctx, globalScale, t.targetBottomPercent * this.canvas.height));

            const bottom = (i <= 1) ? horizon : 1.0;
            layer.draw(ctx, this.canvas.width, this.canvas.height, bottom, globalScale);
        });
    }

    animate() {
        if (!this.isInitialized || this.manualMode) return;

        this.update();
        this.render();

        this.animationId = requestAnimationFrame(() => this.animate());
    }

    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }
}

class Sprite {
    constructor(image, x = 0, y = 0, scale = 1.0) {
        this.image = image;
        this.x = x;
        this.y = y;
        this.scale = scale;
    }

    getDimensions(globalScale) {
        return {
            w: this.image.naturalWidth * globalScale * this.scale,
            h: this.image.naturalHeight * globalScale * this.scale
        };
    }

    isOffScreen(globalScale, canvasWidth) {
        const { w } = this.getDimensions(globalScale);
        // 雙向檢測：確保物件在左側或右側畫面外足夠遠的地方被清除
        return this.x + w < -300 || this.x > canvasWidth + 300;
    }
}

class BackgroundLayer extends Sprite {
    constructor(image, type, speeds) {
        super(image);
        this.type = type;
        this.speed = speeds[this.type] || 0;
        this.scrollX = 0;
    }

    update() {
        this.scrollX += this.speed;
    }

    draw(ctx, canvasWidth, canvasHeight, targetBottomPercent, globalScale) {
        const { w, h } = this.getDimensions(globalScale);
        
        // 修復 JavaScript 負數取模問題，確保 currentScrollX 永遠落在 [0, w) 區間
        // 這樣 x 的起點永遠會是負數 (或 0)，確保左側邊緣不會有破圖空白
        const currentScrollX = ((this.scrollX % w) + w) % w;

        const yPos = (canvasHeight * targetBottomPercent) - h;
        const overlap = 1.5;

        for (let x = -currentScrollX; x < canvasWidth; x += w) {
            ctx.drawImage(this.image, x, yPos, w + overlap, h);
        }
    }
}

class MovingEntity extends Sprite {
    constructor(image, x, y, speed, scale, renderIndex) {
        super(image, x, y, scale);
        this.speed = speed;
        this.renderIndex = renderIndex;
    }

    update(customSpeed) {
        this.x -= (customSpeed !== undefined ? customSpeed : this.speed);
    }

    draw(ctx, globalScale, yPosOverride) {
        const { w, h } = this.getDimensions(globalScale);
        const y = yPosOverride !== undefined ? yPosOverride - h : this.y;
        ctx.drawImage(this.image, this.x, y, w, h);
    }
}

window.BGScroller = BGScroller;
