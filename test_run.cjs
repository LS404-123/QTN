// Mock DOM environment to test simulation.js runtime execution
const fs = require('fs');
const path = require('path');

global.window = global;
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.Path2D = class {}; // Mock Path2D

// Mock Canvas and Context
class MockContext {
    clearRect() {}
    beginPath() {}
    moveTo() {}
    lineTo() {}
    stroke() {}
    save() {}
    restore() {}
    translate() {}
    rotate() {}
    scale() {}
    ellipse() {}
    fill() {}
    fillRect() {}
    drawImage() {}
    fillText() {}
}

class MockCanvas {
    constructor() {
        this.width = 1120;
        this.height = 630;
    }
    getContext() {
        return new MockContext();
    }
}

global.document = {
    getElementById(id) {
        if (id === 'simCanvas') {
            return new MockCanvas();
        }
        return {
            addEventListener() {},
            value: '0',
            innerText: '',
            classList: { add() {}, remove() {}, toggle() {} }
        };
    },
    createElement(tag) {
        if (tag === 'canvas') {
            return new MockCanvas();
        }
        return {};
    },
    querySelectorAll() {
        return [];
    },
    querySelector() {
        return {
            classList: { add() {}, remove() {}, toggle() {} }
        };
    },
    addEventListener() {}
};

// Mock svgs.js exports
const svgsMock = {
    rodSVGPath: {},
    gearboxSVGPath: {},
    crankSVGPath: {},
    motorSVGPath: {}
};
require.cache[path.resolve(__dirname, './svgs.js')] = {
    id: path.resolve(__dirname, './svgs.js'),
    filename: path.resolve(__dirname, './svgs.js'),
    loaded: true,
    exports: svgsMock
};

// Mock bg_scroll.js exports
class MockBGScroller {
    constructor() {
        this.isInitialized = true;
    }
    updateSpeed() {}
    update() {}
    render() {}
    getLayerTop() { return 500; }
}
global.BGScroller = MockBGScroller; // Make global for eval to find

const bgScrollMock = { BGScroller: MockBGScroller };
require.cache[path.resolve(__dirname, './bg_scroll.js')] = {
    id: path.resolve(__dirname, './bg_scroll.js'),
    filename: path.resolve(__dirname, './bg_scroll.js'),
    loaded: true,
    exports: bgScrollMock
};

// Now read simulation.js, strip imports, and run it
let code = fs.readFileSync(path.resolve(__dirname, './六足機械/modularized/simulation.js'), 'utf8');
// Strip imports and exports
code = code.replace(/import\s+[\s\S]+?from\s+['"].+?['"];/g, '');
code = code.replace(/export\s+/g, '');

try {
    console.log("Starting runtime simulation execution test...");
    eval(code);
    console.log("Success! No immediate runtime errors.");
} catch (e) {
    console.error("Runtime error caught:", e);
}
