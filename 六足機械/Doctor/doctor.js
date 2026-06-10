import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const AppConfig = {
    defaultModelUrl: '/new_robot_compressed.glb',
    cameraDistanceMultiplier: 1.5,
    forcePlasticMaterial: true,
    defaultRoughness: 0.6,
    defaultMetalness: 0.0,
    excludeColorKeywords: ['steel', 'carbon'],

    // BackSide 描邊參數配置 (控制每個零件的黑色外框)
    outlineThickness: 1.005, // 粗細厚度：通常介於 1.001 (極細) 到 1.005 (較粗) 之間
    outlineColor: 0x000000   // 描邊色彩：0x000000 為黑色
};

const PartColorOverrides = [
    { part: "base", color: 0xff8800 }
];

const container = document.getElementById('viewer-container');
let scene, camera, renderer, orbit, transformControl;
let composer, outlinePass, baseOutlinePass;
let targetFocusPos = null; // 用於平滑對焦的目標位置
let loadedModel = null;
let forceRender = true;
const lastCameraPos = new THREE.Vector3();
const lastCameraRot = new THREE.Quaternion();

let isDragging = false;
let selectedGroup = null;
let highlightedObject = null;
let isAdminMode = false;

// ==========================================
// 診斷系統狀態
// ==========================================
let inspectedParts = [];
let totalPartsCount = 20; // 假定的總零件數，用來計算進度

// ==========================================
// 初始化 3D 環境
// ==========================================
function init3D() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 1000);
    camera.position.set(0, 2, 5);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(5, 10, 7.5);
    scene.add(dirLight);

    orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.05;

    transformControl = new TransformControls(camera, renderer.domElement);
    transformControl.setSpace('world');
    transformControl.addEventListener('dragging-changed', function (event) {
        orbit.enabled = !event.value;
    });
    transformControl.addEventListener('change', () => forceRender = true);
    scene.add(transformControl.getHelper());

    // ==========================================
    // 後處理效果 (Post-processing) 設定
    // ==========================================
    composer = new EffectComposer(renderer);

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // 選取高亮用的 OutlinePass (發光強、診斷紅色)
    outlinePass = new OutlinePass(new THREE.Vector2(container.clientWidth, container.clientHeight), scene, camera);
    outlinePass.edgeStrength = 4.0;
    outlinePass.edgeGlow = 1.0;
    outlinePass.edgeThickness = 3.0;
    outlinePass.visibleEdgeColor.set('#f87171');
    outlinePass.hiddenEdgeColor.set('#581c1c');
    composer.addPass(outlinePass);

    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    window.addEventListener('resize', onWindowResize);

    setupInteractions();
    setupUIControls();
    loadRobotModel(AppConfig.defaultModelUrl);
    animate();
}

function onWindowResize() {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
    if (composer) composer.setSize(container.clientWidth, container.clientHeight);
    forceRender = true;
}

// ==========================================
// 模型載入與處理
// ==========================================
function loadRobotModel(url) {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        const loadingText = loadingOverlay.querySelector('.loading-text');
        if (loadingText) loadingText.textContent = '載入機器人模型中...';
        loadingOverlay.style.display = 'flex';
    }

    if (loadedModel) {
        selectGroup(null);
        scene.remove(loadedModel);
    }
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    loader.setDRACOLoader(dracoLoader);
    loader.load(url, function (gltf) {
        console.log('gltf loaded:', gltf);

        const processLoadedModel = (model) => {
            loadedModel = model;
            const clonedMaterials = {};

            const json = gltf.parser.json;
            const matMap = {};
            if (json.materials) {
                json.materials.forEach(m => {
                    if (m.name && m.extensions && m.extensions.KHR_materials_pbrSpecularGlossiness) {
                        matMap[m.name] = m.extensions.KHR_materials_pbrSpecularGlossiness;
                    }
                });
            }

            loadedModel.traverse((child) => {
                if (child.isMesh && child.material) {
                    child.frustumCulled = false;
                    if (child.material.name && matMap[child.material.name]) {
                        const sg = matMap[child.material.name];
                        if (sg.diffuseFactor) {
                            child.material.color.fromArray(sg.diffuseFactor);
                            if (sg.diffuseFactor[0] === 0 && sg.diffuseFactor[1] === 0 && sg.diffuseFactor[2] === 0) {
                                if (sg.specularFactor) child.material.color.fromArray(sg.specularFactor);
                            }
                        }
                    }

                    if (AppConfig.forcePlasticMaterial) {
                        child.material.metalness = AppConfig.defaultMetalness;
                        child.material.roughness = AppConfig.defaultRoughness;
                    }

                    const partNameToCheck = (child.name + (child.parent ? child.parent.name : "")).toLowerCase();
                    const matName = (child.material.name || "").toLowerCase();

                    for (const rule of PartColorOverrides) {
                        if (partNameToCheck.includes(rule.part.toLowerCase())) {
                            if (rule.material && !matName.includes(rule.material.toLowerCase())) continue;
                            if (!rule.material) {
                                let isExcluded = false;
                                for (const keyword of AppConfig.excludeColorKeywords) {
                                    if (matName.includes(keyword.toLowerCase())) {
                                        isExcluded = true;
                                        break;
                                    }
                                }
                                if (isExcluded) continue;
                            }

                            const cacheKey = child.material.uuid + '_' + rule.color;
                            if (!clonedMaterials[cacheKey]) {
                                const newMat = child.material.clone();
                                newMat.color.setHex(rule.color);
                                clonedMaterials[cacheKey] = newMat;
                            }
                            child.material = clonedMaterials[cacheKey];
                            break;
                        }
                    }
                    child.material.needsUpdate = true;
                }
            });

            scene.add(loadedModel);

            // 為每個子零件加上獨立的極細黑色描邊 (BackSide 擴展描邊)
            const meshesToOutline = [];
            loadedModel.traverse((child) => {
                if (child.isMesh && child.material) {
                    meshesToOutline.push(child);
                }
            });

            meshesToOutline.forEach((child) => {
                const outlineMat = new THREE.MeshBasicMaterial({
                    color: AppConfig.outlineColor,
                    side: THREE.BackSide
                });
                const outlineMesh = new THREE.Mesh(child.geometry, outlineMat);
                const t = AppConfig.outlineThickness;
                outlineMesh.scale.set(t, t, t);
                outlineMesh.userData.isOutline = true;
                outlineMesh.raycast = () => { }; // 停用射線偵測避免影響選取
                child.add(outlineMesh);
            });

            const box = new THREE.Box3().setFromObject(loadedModel);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);

            window.robotCenter = center.clone();
            window.robotDist = maxDim * AppConfig.cameraDistanceMultiplier;

            camera.position.set(-0.39, 0.28, 0.26);
            orbit.target.set(-0.03, 0.05, -0.02);
            orbit.update();

            let effectiveRoot = loadedModel;
            while (effectiveRoot.children.length === 1 && !effectiveRoot.children[0].isMesh) {
                effectiveRoot = effectiveRoot.children[0];
            }
            loadedModel.userData.effectiveRoot = effectiveRoot;
            forceRender = true;
            if (loadingOverlay) loadingOverlay.style.display = 'none';
        };

        if (gltf.scene) {
            processLoadedModel(gltf.scene);
        } else {
            gltf.parser.getDependencies('node').then((nodes) => {
                const group = new THREE.Group();
                group.name = 'robot_root';
                nodes.forEach((node) => {
                    if (node.parent === null) {
                        group.add(node);
                    }
                });
                processLoadedModel(group);
            }).catch((err) => {
                console.error('自建場景時解析節點失敗:', err);
                if (loadingOverlay) loadingOverlay.style.display = 'none';
            });
        }
    }, undefined, function (error) {
        console.error('載入模型時發生錯誤:', error);
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    });
}

// ==========================================
// 互動與選取
// ==========================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let pointerDownPos = new THREE.Vector2();

function selectGroup(group, mesh = null) {
    const partInfo = document.getElementById('part-info-overlay');
    const groupNameEl = document.getElementById('group-name');
    const partNameEl = document.getElementById('part-name');
    const btnMark = document.getElementById('btn-mark-inspected');

    if (selectedGroup) {
        selectedGroup = null;
        highlightedObject = null;
        transformControl.detach();
        if (outlinePass) outlinePass.selectedObjects = [];
        
        // 取消選取時，相機目標平滑滑回機器人整體中心
        if (window.robotCenter) {
            targetFocusPos = window.robotCenter.clone();
        } else {
            targetFocusPos = null;
        }
    }

    if (group) {
        selectedGroup = group;
        highlightedObject = group;

        if (outlinePass) outlinePass.selectedObjects = [highlightedObject];

        transformControl.attach(selectedGroup);
        
        // 計算選中零件包圍盒的世界座標幾何中心，開啟對焦
        const box = new THREE.Box3().setFromObject(highlightedObject);
        targetFocusPos = box.getCenter(new THREE.Vector3());
        const gName = group.name || '未命名群組';
        const pName = mesh ? (mesh.name || '未命名零件') : '無';

        groupNameEl.textContent = gName;
        partNameEl.textContent = pName;
        partInfo.style.display = 'block';

        // Setup marking button
        if (inspectedParts.includes(gName)) {
            btnMark.style.display = 'none';
        } else {
            btnMark.style.display = 'block';
            btnMark.onclick = () => {
                markPartAsInspected(gName);
                btnMark.style.display = 'none';
            };
        }

        // Trigger AI awareness
        addChatMessage('系統', `正在檢查零件：${gName}。你觀察到有什麼異常嗎？`, 'ai');
        updateQuickReplies([
            `確認 ${gName} 正常`,
            `${gName} 鬆動了`,
            `${gName} 卡住了`
        ]);

    } else {
        partInfo.style.display = 'none';
    }
    forceRender = true;
}

function setupInteractions() {
    container.addEventListener('pointerdown', (event) => {
        pointerDownPos.set(event.clientX, event.clientY);
    });

    container.addEventListener('pointerup', (event) => {
        if (transformControl.dragging) return;

        const dist = Math.hypot(event.clientX - pointerDownPos.x, event.clientY - pointerDownPos.y);
        if (dist > 5) return;

        const rect = container.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        if (loadedModel) {
            const intersects = raycaster.intersectObject(loadedModel, true);
            const hit = intersects.find(i => i.object.isMesh);

            if (hit) {
                let obj = hit.object;
                let targetGroup = obj;

                const effectiveRoot = loadedModel.userData.effectiveRoot || loadedModel;
                while (obj.parent && obj.parent !== effectiveRoot && obj.parent !== scene && obj.parent !== loadedModel) {
                    obj = obj.parent;
                    targetGroup = obj;
                }
                selectGroup(targetGroup, hit.object);
            } else {
                selectGroup(null);
            }
        }
    });

    window.addEventListener('keydown', function (event) {
        if (event.key.toLowerCase() === 'escape') {
            selectGroup(null);
        }
    });
}

// ==========================================
// 視角與顯示模式控制
// ==========================================
let cameraAnimFrame = null;
function moveCameraTo(targetPos) {
    forceRender = true;
    if (!window.robotCenter) return;
    if (cameraAnimFrame) cancelAnimationFrame(cameraAnimFrame);

    const startPos = camera.position.clone();
    const duration = 600;
    const startTime = performance.now();

    function updateCam(time) {
        const elapsed = time - startTime;
        const t = Math.min(elapsed / duration, 1.0);
        const ease = 1 - Math.pow(1 - t, 4);
        camera.position.lerpVectors(startPos, targetPos, ease);
        orbit.target.copy(window.robotCenter);
        orbit.update();
        if (t < 1.0) cameraAnimFrame = requestAnimationFrame(updateCam);
        else cameraAnimFrame = null;
    }
    cameraAnimFrame = requestAnimationFrame(updateCam);
}

function setupUIControls() {
    document.getElementById('btn-top').addEventListener('click', () => {
        if (window.robotCenter) {
            const p = window.robotCenter.clone();
            p.y += window.robotDist * 1.2;
            p.z += 0.001;
            moveCameraTo(p);
        }
    });

    document.getElementById('btn-front').addEventListener('click', () => {
        if (window.robotCenter) {
            const p = window.robotCenter.clone();
            p.z -= window.robotDist;
            moveCameraTo(p);
        }
    });

    document.getElementById('btn-side').addEventListener('click', () => {
        if (window.robotCenter) {
            const p = window.robotCenter.clone();
            p.x += window.robotDist;
            moveCameraTo(p);
        }
    });

    let isWireframe = false;
    let isTransparent = false;
    const edgesGeoCache = new Map();
    const edgesMatCache = new Map();

    document.getElementById('btn-wireframe').addEventListener('click', (e) => {
        isWireframe = !isWireframe;
        e.target.classList.toggle('active', isWireframe);

        if (isWireframe && isTransparent) {
            isTransparent = false;
            document.getElementById('btn-transparent').classList.remove('active');
        }

        if (loadedModel) {
            const loadingOverlay = document.getElementById('loading-overlay');
            loadingOverlay.style.display = 'flex';

            setTimeout(() => {
                ensureWireframeEdges();
                updateMaterials();
                loadingOverlay.style.display = 'none';
            }, 30);
        }
    });

    document.getElementById('btn-transparent').addEventListener('click', (e) => {
        isTransparent = !isTransparent;
        e.target.classList.toggle('active', isTransparent);

        if (isTransparent && isWireframe) {
            isWireframe = false;
            document.getElementById('btn-wireframe').classList.remove('active');
        }

        if (loadedModel) {
            updateMaterials();
        }
    });

    document.getElementById('btn-theme').addEventListener('click', (e) => {
        const isLight = document.body.classList.toggle('light-mode');
        e.target.textContent = isLight ? '🌙' : '☀️';
        e.target.title = isLight ? '切換暗色模式' : '切換淺色模式';
        
        if (outlinePass) {
            const dangerColorHex = getComputedStyle(document.body).getPropertyValue('--danger-color').trim();
            outlinePass.visibleEdgeColor.set(dangerColorHex);
            outlinePass.hiddenEdgeColor.set(isLight ? '#ef4444' : '#581c1c');
        }
        
        forceRender = true;
    });

    function ensureWireframeEdges() {
        loadedModel.traverse((child) => {
            if (child.isMesh && !child.userData.isOutline && !child.userData.edgesLine) {
                let edges = edgesGeoCache.get(child.geometry);
                if (!edges) {
                    edges = new THREE.EdgesGeometry(child.geometry, 15);
                    edgesGeoCache.set(child.geometry, edges);
                }
                const matColorHex = (child.material && child.material.color) ? child.material.color.getHex() : 0x00e5ff;
                let lineMat = edgesMatCache.get(matColorHex);
                if (!lineMat) {
                    lineMat = new THREE.LineBasicMaterial({ color: matColorHex });
                    edgesMatCache.set(matColorHex, lineMat);
                }
                const line = new THREE.LineSegments(edges, lineMat);
                child.add(line);
                child.userData.edgesLine = line;
                child.userData.edgesLine.visible = false;
            }
        });
    }

    function updateMaterials() {
        loadedModel.traverse((child) => {
            if (child.isMesh && child.userData.isOutline) {
                child.visible = !isWireframe && !isTransparent;
                return;
            }
            if (child.isMesh && child.material) {
                if (child.material.userData.orig === undefined) {
                    child.material.userData.orig = {
                        colorWrite: child.material.colorWrite !== false,
                        depthWrite: child.material.depthWrite !== false,
                        transparent: child.material.transparent || false,
                        opacity: child.material.opacity !== undefined ? child.material.opacity : 1.0,
                        blending: child.material.blending
                    };
                }

                const orig = child.material.userData.orig;
                const partNameToCheck = (child.name + (child.parent ? child.parent.name : "")).toLowerCase();
                const isBase = partNameToCheck.includes('base');

                let targetColorWrite = orig.colorWrite;
                let targetDepthWrite = orig.depthWrite;
                let targetTransparent = orig.transparent;
                let targetOpacity = orig.opacity;
                let targetBlending = orig.blending;

                if (isWireframe) {
                    targetColorWrite = false;
                    targetDepthWrite = false;
                }

                if (isTransparent && !isBase) {
                    targetTransparent = true;
                    targetOpacity = 0.45; // 調整透明度以利透視
                    targetDepthWrite = false; // 透明模式下必須關閉 depthWrite，否則會阻擋內部零件繪製
                    targetBlending = THREE.NormalBlending;
                }

                child.material.colorWrite = targetColorWrite;
                child.material.depthWrite = targetDepthWrite;
                child.material.transparent = targetTransparent;
                child.material.opacity = targetOpacity;
                child.material.blending = targetBlending;

                child.material.needsUpdate = true;

                if (child.userData.edgesLine) {
                    child.userData.edgesLine.visible = isWireframe;
                }
            }
        });
        forceRender = true;
    }

    // Setup initial Quick Replies
    const repliesContainer = document.getElementById('quick-replies');
    repliesContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('reply-btn')) {
            const text = e.target.textContent;
            addChatMessage('學生', text, 'user');
            handleUserReply(text);
        }
    });

    // Admin Mode Toggle
    let infoClickCount = 0;
    let infoClickTimer = null;
    document.getElementById('info-overlay').addEventListener('click', () => {
        infoClickCount++;
        if (infoClickCount >= 3) {
            isAdminMode = !isAdminMode;
            document.getElementById('admin-panel').style.display = isAdminMode ? 'flex' : 'none';
            infoClickCount = 0;
            forceRender = true;
        }
        clearTimeout(infoClickTimer);
        infoClickTimer = setTimeout(() => { infoClickCount = 0; }, 400);
    });
}

// ==========================================
// 狀態與對話區邏輯
// ==========================================
function updateProgress() {
    const percent = Math.min(Math.round((inspectedParts.length / totalPartsCount) * 100), 100);
    document.getElementById('progress-bar').style.width = `${percent}%`;
    document.getElementById('progress-text').textContent = `已排除 ${percent}%`;
}

function markPartAsInspected(partName) {
    if (!inspectedParts.includes(partName)) {
        inspectedParts.push(partName);

        const list = document.getElementById('inspected-list');
        // Remove empty state if present
        const emptyState = list.querySelector('.empty-state');
        if (emptyState) emptyState.remove();

        const tag = document.createElement('div');
        tag.className = 'part-tag';
        tag.innerHTML = `✅ ${partName} <span class="remove" onclick="removeInspected('${partName}')">✖</span>`;
        tag.id = `tag-${partName}`;
        list.appendChild(tag);

        updateProgress();
        addChatMessage('系統', `已確認 ${partName} 運作正常，加入已排查清單。`, 'ai');
        updateQuickReplies([
            '機器人完全不動',
            '聽到齒輪異音',
            '走路姿勢跛腳'
        ]);
        selectGroup(null); // Deselect after marking
    }
}

window.removeInspected = function (partName) {
    inspectedParts = inspectedParts.filter(p => p !== partName);
    const tag = document.getElementById(`tag-${partName}`);
    if (tag) tag.remove();

    if (inspectedParts.length === 0) {
        document.getElementById('inspected-list').innerHTML = `<div class="empty-state">尚未排查任何零件</div>`;
    }
    updateProgress();
};

function addChatMessage(sender, text, type = 'ai') {
    const history = document.getElementById('chat-history');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${type}`;
    msgDiv.innerHTML = `<div class="msg-content">${text}</div>`;
    history.appendChild(msgDiv);
    history.scrollTop = history.scrollHeight;
}

function updateQuickReplies(options) {
    const container = document.getElementById('quick-replies');
    container.innerHTML = '';
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'reply-btn';
        btn.textContent = opt;
        container.appendChild(btn);
    });
}

function handleUserReply(text) {
    // Mock simple decision tree
    setTimeout(() => {
        if (text.includes('不動') || text.includes('馬達')) {
            addChatMessage('系統', '收到。請先確認電池是否有電？另外可以點擊模型上的馬達，檢查是否有鬆脫。', 'ai');
            updateQuickReplies([
                '電池剛充飽',
                '馬達電線鬆脫',
                '有燒焦味'
            ]);
        } else if (text.includes('異音')) {
            addChatMessage('系統', '異音通常來自齒輪箱。請點擊 3D 模型上的齒輪箱，並開啟「X-Ray 透明模式」或「Wireframe」來觀察內部。', 'ai');
            updateQuickReplies([
                '打開了，看到齒輪掃齒',
                '齒輪看起來沒壞',
                '不知道怎麼拆'
            ]);
        } else if (text.includes('跛腳')) {
            addChatMessage('系統', '跛腳可能是曲柄長度錯誤或相位角錯位。你可以點擊腿部機構，測量曲柄長度是否為指定規格？', 'ai');
            updateQuickReplies([
                '曲柄太長了',
                '機構裝反了',
                '長度正確，但相位不對'
            ]);
        } else if (text.includes('正常')) {
            addChatMessage('系統', '太好了！請繼續檢查其他可能的故障點。', 'ai');
            updateQuickReplies([
                '機器人完全不動',
                '聽到齒輪異音',
                '走路姿勢跛腳'
            ]);
        } else {
            addChatMessage('系統', '了解。你可以直接在 3D 模型上點擊你懷疑有問題的零件，我會協助你排查。', 'ai');
        }
    }, 600);
}

// ==========================================
// 渲染迴圈
// ==========================================
function animate() {
    requestAnimationFrame(animate);

    // 1. 零件選取時的相機重心平滑滑動對焦 (Lerp)
    if (targetFocusPos && orbit.target.distanceTo(targetFocusPos) > 0.001) {
        orbit.target.lerp(targetFocusPos, 0.08);
        forceRender = true;
    }

    orbit.update();

    // 2. 選取外框紅色脈衝呼吸閃爍 (Pulsating Outline Glow)
    if (outlinePass && outlinePass.selectedObjects.length > 0) {
        const time = performance.now() * 0.004; // 調整閃爍頻率
        outlinePass.edgeStrength = 3.5 + Math.sin(time) * 1.5; // 在 2.0 到 5.0 之間擺動
        outlinePass.edgeGlow = 0.8 + Math.sin(time) * 0.4;     // 在 0.4 到 1.2 之間擺動
        forceRender = true;
    }

    const cameraMoved = !camera.position.equals(lastCameraPos) || !camera.quaternion.equals(lastCameraRot);
    if (cameraMoved || forceRender) {
        if (composer) {
            composer.render();
        } else {
            renderer.render(scene, camera);
        }
        lastCameraPos.copy(camera.position);
        lastCameraRot.copy(camera.quaternion);
        forceRender = false;

        if (isAdminMode) {
            document.getElementById('admin-pos').innerText =
                `${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}`;
            document.getElementById('admin-rot').innerText =
                `${(camera.rotation.x * 180 / Math.PI).toFixed(1)}°, ${(camera.rotation.y * 180 / Math.PI).toFixed(1)}°, ${(camera.rotation.z * 180 / Math.PI).toFixed(1)}°`;
            document.getElementById('admin-target').innerText =
                `${orbit.target.x.toFixed(2)}, ${orbit.target.y.toFixed(2)}, ${orbit.target.z.toFixed(2)}`;
        }
    }
}

// 啟動應用
init3D();
