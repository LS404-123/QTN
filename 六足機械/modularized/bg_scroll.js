/**
 * BGScroller - 模組化無縫捲動視差背景
 * 支援 16:9 比例自動適應任何容器
 */

class BGScroller {
    constructor(containerId, config = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`BGScroller: Container with ID "${containerId}" not found.`);
            return;
        }

        this.manualMode = config.manualMode || false;

        // 支援直接傳入容器或 Canvas 本身
        if (this.container instanceof HTMLCanvasElement) {
            this.canvas = this.container;
        } else {
            this.canvas = this.container.querySelector('canvas') || document.createElement('canvas');
            if (!this.canvas.parentElement) {
                this.container.innerHTML = ''; // 清空預設內容
                this.container.appendChild(this.canvas);
            }
        }
        this.ctx = this.canvas.getContext('2d', { alpha: false });

        // 基礎配置
        this.config = {
            speeds: {
                hill2: 0.05,
                hill1: 0.1,
                ground: 0.2,
                cloud: 0.1,
                ...config.speeds
            },
            limits: {
                maxClouds: 5,
                maxTrees: 12,
                ...config.limits
            },
            colors: {
                sky: '#C1E8F9',
                ...config.colors
            },
            resources: {
                layers: [
                    { path: '../SVG/bg/hill/hill2.svg', type: 'hill2' },
                    { path: '../SVG/bg/hill/hill1.svg', type: 'hill1' },
                    { path: '../SVG/bg/road/ground3.svg', type: 'ground' },
                    { path: '../SVG/bg/road/ground2.svg', type: 'ground' },
                    { path: '../SVG/bg/road/ground1.svg', type: 'ground' }
                ],
                clouds: [
                    '../SVG/bg/cloud/cloud1.svg',
                    '../SVG/bg/cloud/cloud2.svg',
                    '../SVG/bg/cloud/cloud3.svg'
                ],
                trees: [
                    '../SVG/bg/tree/tree1.svg',
                    '../SVG/bg/tree/tree2.svg',
                    '../SVG/bg/tree/tree3.svg'
                ],
                sun: '../SVG/bg/sun/sun.svg',
                ...config.resources
            }
        };

        this.layers = [];
        this.cloudImages = [];
        this.treeImages = [];
        this.sunImage = null;

        this.activeClouds = [];
        this.activeTrees = [];
        this.nextTreeSpacing = 120;
        this.nextCloudSpacing = 150;

        this.isInitialized = false;
        this.animationId = null;

        this.init();
    }

    async init() {
        try {
            const [bgImgs, clImgs, trImgs, sImg] = await Promise.all([
                Promise.all(this.config.resources.layers.map(l => this.loadImage(l.path))),
                Promise.all(this.config.resources.clouds.map(path => this.loadImage(path))),
                Promise.all(this.config.resources.trees.map(path => this.loadImage(path))),
                this.loadImage(this.config.resources.sun)
            ]);

            this.layers = bgImgs.map((img, i) => new BackgroundLayer(img, this.config.resources.layers[i].type, this.config.speeds));
            this.cloudImages = clImgs;
            this.treeImages = trImgs;
            this.sunImage = sImg;

            if (!this.manualMode) {
                this.resize();
                window.addEventListener('resize', () => this.resize());
            }

            // 初始填充
            const horizon = this.getHorizon();
            const roadTop = this.getRoadTop();

            this.prePopulateClouds(horizon);
            this.prePopulateTrees(horizon, roadTop);

            this.isInitialized = true;
            if (!this.manualMode) {
                this.animate();
            }
        } catch (error) {
            console.error("BGScroller Initialization failed:", error);
        }
    }

    loadImage(path) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(`Failed to load image: ${path}`);
            img.src = path;
        });
    }

    resize() {
        const rect = this.container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        // 維持 16:9 比例的 Canvas 大小
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
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

        const rightmostX = this.activeClouds.reduce((max, c) => Math.max(max, c.x), -1000);
        if (randomX || rightmostX < this.canvas.width - this.nextCloudSpacing) {
            const img = this.cloudImages[Math.floor(Math.random() * this.cloudImages.length)];
            const x = randomX ? Math.random() * this.canvas.width : this.canvas.width;
            const y = -10 + Math.random() * ((horizon * this.canvas.height) * 0.3 + 10);
            const speed = this.config.speeds.cloud * (0.8 + Math.random() * 0.4);
            const scale = 0.4 + Math.random() * 0.5;
            const renderIndex = Math.random() < 0.3 ? 0.5 : 1.5;

            this.activeClouds.push(new MovingEntity(img, x, y, speed, scale, renderIndex));
            this.nextCloudSpacing = 100 + Math.random() * 200;
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

        const rightmostX = this.activeTrees.reduce((max, t) => Math.max(max, t.x), -1000);
        if (rightmostX < this.canvas.width - this.nextTreeSpacing) {
            const roadTop = this.getRoadTop();
            const totalGap = roadTop - horizon;
            const bandHeight = (roadTop - totalGap * 0.1 - (horizon + totalGap * 0.3)) / 3;
            const activeHorizon = horizon + totalGap * 0.3;

            const isDouble = Math.random() < 0.6 && this.activeTrees.length + 1 < this.config.limits.maxTrees;

            if (isDouble) {
                const band1 = Math.floor(Math.random() * 3);
                let band2 = Math.floor(Math.random() * 3);
                if (band1 === band2) band2 = (band1 + 1) % 3;

                this.addTree(this.canvas.width, activeHorizon, bandHeight, band1);
                this.addTree(this.canvas.width + 30 + Math.random() * 20, activeHorizon, bandHeight, band2);
            } else {
                this.addTree(this.canvas.width, activeHorizon, bandHeight, Math.floor(Math.random() * 3));
            }
            this.nextTreeSpacing = 80 + Math.random() * 80;
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

    update() {
        if (!this.isInitialized) return;
        const horizon = this.getHorizon();

        this.spawnCloud(horizon);
        this.spawnTree(horizon);

        this.activeClouds.forEach(c => c.update());
        this.activeTrees.forEach(t => t.update(this.config.speeds.ground));

        const scale = this.getGlobalScale();
        this.activeClouds = this.activeClouds.filter(c => !c.isOffScreen(scale));
        this.activeTrees = this.activeTrees.filter(t => !t.isOffScreen(scale));
        this.activeTrees.sort((a, b) => a.targetBottomPercent - b.targetBottomPercent);
    }

    render(externalCtx) {
        if (!this.isInitialized) return;
        const ctx = externalCtx || this.ctx;
        const globalScale = this.getGlobalScale();
        const horizon = this.getHorizon();

        // 背景清理
        ctx.fillStyle = this.config.colors.sky;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 繪製太陽
        if (this.sunImage) {
            const sunW = this.sunImage.naturalWidth * globalScale;
            const sunH = this.sunImage.naturalHeight * globalScale;
            ctx.drawImage(this.sunImage, this.canvas.width - sunW, 0, sunW, sunH);
        }

        // 層次渲染
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

/**
 * 內部輔助類別
 */
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

    isOffScreen(globalScale) {
        const { w } = this.getDimensions(globalScale);
        return this.x + w < 0;
    }
}

class BackgroundLayer extends Sprite {
    constructor(image, type, speeds) {
        super(image);
        this.type = type;
        this.speed = speeds[this.type] || 0;
        this.scrollX = 0;
    }

    draw(ctx, canvasWidth, canvasHeight, targetBottomPercent, globalScale) {
        const { w, h } = this.getDimensions(globalScale);
        this.scrollX = (this.scrollX + this.speed) % w;

        const yPos = (canvasHeight * targetBottomPercent) - h;
        const overlap = 1.5;

        for (let x = -this.scrollX; x < canvasWidth; x += w) {
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
