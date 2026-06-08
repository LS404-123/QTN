/**
 * AI Chat Logic - 🤖 小六 AI 診斷助手
 */
import { getSimplifiedAnalytics } from '../simulation/simulation.js';
import STATIC_COSTAR_PROMPT from '../../../AI_Chatbot_Framework_COSTAR_EN.md?raw';
import KINEMATICS_REFERENCE from '../simulation/Kinematics_Reference.md?raw';

const ChatManager = {
    history: [],
    isWaiting: false,
    suggestionCooldown: false,
    debugHistory: [],    // 儲存偵錯歷史
    currentLogIndex: -1, // 當前顯示的日誌索引
    lastSentParamsJson: null, // 紀錄上次發送給 AI 的參數狀態
    lastDiagnosisJson: null, // 紀錄上次的診斷狀態
    frustrationCount: 0, // 追蹤學生卡關程度
    lastMetrics: null,    // 儲存前一次的物理指標

    init() {
        console.log("[ChatManager] Initializing...");
        this.chatHistory = document.getElementById('chatHistory');
        this.userInput = document.getElementById('userInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.debugCardContainer = document.getElementById('debugCardContainer');
        this.logCounter = document.getElementById('logCounter');
        this.prevLogBtn = document.getElementById('prevLog');
        this.nextLogBtn = document.getElementById('nextLog');
        this.suggestedOptionsContainer = document.getElementById('suggestedOptionsContainer');

        if (!this.chatHistory || !this.userInput || !this.sendBtn) {
            console.error("[ChatManager] Failed to find UI elements!");
            return;
        }

        this.sendBtn.addEventListener('click', () => this.handleSendMessage());
        this.userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSendMessage();
        });

        // 導航按鈕
        this.prevLogBtn?.addEventListener('click', () => this.showLog(this.currentLogIndex - 1));
        this.nextLogBtn?.addEventListener('click', () => this.showLog(this.currentLogIndex + 1));

        console.log("[ChatManager] Ready!");
    },

    /**
     * 顯示特定索引的日誌卡片
     */
    showLog(index) {
        if (index < 0 || index >= this.debugHistory.length) return;
        this.currentLogIndex = index;
        this.renderDebugCard();
    },

    /**
     * 渲染當前的偵錯卡片
     */
    renderDebugCard() {
        if (!this.debugCardContainer || this.currentLogIndex === -1) return;

        const log = this.debugHistory[this.currentLogIndex];
        const timeStr = new Date(log.timestamp).toLocaleTimeString();

        this.debugCardContainer.innerHTML = `
            <div class="debug-card">
                <span class="debug-time">[${timeStr}] 📡 傳輸批次 #${this.currentLogIndex + 1}</span>
                ${log.content}
            </div>
        `;

        if (this.logCounter) {
            this.logCounter.innerText = `${this.currentLogIndex + 1} / ${this.debugHistory.length}`;
        }
    },

    /**
     * 新增訊息到 UI
     */
    addMessage(role, text, options = []) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role === 'ai' ? 'ai-msg' : 'user-msg'}`;

        msgDiv.innerHTML = `
            <div class="msg-avatar">${role === 'ai' ? '🤖' : '👤'}</div>
            <div class="msg-content">${text}</div>
        `;

        // Stage 3: 動態按鈕渲染
        if (this.suggestedOptionsContainer) {
            this.suggestedOptionsContainer.innerHTML = ''; // 每次有新訊息先清空
            if (options && options.length > 0) {
                options.forEach(optText => {
                    const btn = document.createElement('button');
                    btn.className = 'suggested-reply-btn';
                    // Inline styles for fast prototyping
                    btn.style.padding = '8px 14px';
                    btn.style.borderRadius = '20px';
                    btn.style.border = '1px solid rgba(74, 222, 128, 0.8)';
                    btn.style.background = 'rgba(74, 222, 128, 0.15)';
                    btn.style.color = '#166534'; // 深綠色，確保在淺色背景上顯示清楚
                    btn.style.fontWeight = '600';
                    btn.style.cursor = 'pointer';
                    btn.style.textAlign = 'left';
                    btn.style.fontSize = '0.9rem';
                    btn.style.transition = 'all 0.2s';
                    
                    btn.onmouseover = () => btn.style.background = 'rgba(74, 222, 128, 0.3)';
                    btn.onmouseout = () => btn.style.background = 'rgba(74, 222, 128, 0.15)';
                    
                    btn.innerText = optText;
                    btn.onclick = () => {
                        this.suggestedOptionsContainer.innerHTML = '';
                        this.handleSendMessage(optText.replace('💬', '').trim());
                    };
                    this.suggestedOptionsContainer.appendChild(btn);
                });
            }
        }

        this.chatHistory.appendChild(msgDiv);
        this.chatHistory.scrollTop = this.chatHistory.scrollHeight;

        // 儲存至歷史紀錄 (格式化為 Gemini 格式)
        const geminiRole = role === 'ai' ? 'model' : 'user';
        this.history.push({ role: geminiRole, parts: [{ text: text + (options.length ? '\n' + options.join('\n') : '') }] });
        if (this.history.length > 6) this.history.shift(); // 歷史紀錄修剪：只保留最近 6 句 (約 3 輪對話)
    },

    /**
     * 更新狀態文字
     */
    updateStatus(text) {
        const statusEl = document.querySelector('.status-text');
        const dotEl = document.querySelector('.status-dot');
        if (statusEl) statusEl.innerText = text;

        if (dotEl) {
            dotEl.classList.remove('thinking');
            if (text.includes("看診中")) dotEl.classList.add('thinking');
        }
    },


    /**
     * 處理用戶手動發送訊息
     */
    async handleSendMessage(forcedText = null) {
        let text = forcedText || this.userInput.value.trim();
        if (!text || this.isWaiting) return;

        // 當使用者自己送出時，也清空選項
        if (this.suggestedOptionsContainer && !forcedText) {
            this.suggestedOptionsContainer.innerHTML = '';
        }

        // Stage 4: 輸入驗證與防溢位 (Input Sanitization)
        if (text.length > 100) {
            text = text.substring(0, 100) + "... (文字過長截斷)";
        }

        // Stage 4: 挫折偵測計數器 (Frustration Detection)
        const lazyKeywords = ["不知道", "不懂", "壞了", "不動", "不曉得", "提示"];
        if (text.length < 5 || lazyKeywords.some(kw => text.includes(kw))) {
            this.frustrationCount++;
        } else {
            this.frustrationCount = Math.max(0, this.frustrationCount - 1);
        }

        this.userInput.value = '';
        this.addMessage('user', text);
        await this.getAIResponse(text);
    },




    /**
     * 捕捉當前模擬器畫面 (WebP 格式)
     * 若當前為暫停狀態，則觸發自動播放進行「影子生成 (Ghost run)」
     */
    async captureCanvas(currentParamsJson) {
        let wasPaused = false;
        if (window.getIsPlaying && !window.getIsPlaying()) {
            wasPaused = true;
            const toggleBtn = document.getElementById('toggleBtn');
            if (toggleBtn) toggleBtn.click(); // 啟動隱形播放以收集軌跡
        }

        this.updateStatus(wasPaused ? "正在產生連續攝影分析圖..." : "正在側錄步態分析圖...");
        let result = null;

        if (window.startChronoRecording) {
            result = await window.startChronoRecording(currentParamsJson);
        } else {
            const canvas = document.getElementById('simCanvas');
            if (canvas) result = canvas.toDataURL('image/webp', 0.6);
        }

        if (wasPaused) {
            const toggleBtn = document.getElementById('toggleBtn');
            if (toggleBtn) toggleBtn.click(); // 復原為暫停狀態
        }

        return result;
    },

    /**
     * 獲取 AI 回應 (結構化推理模式)
     */
    async getAIResponse(userText) {
        this.isWaiting = true;

        const analytics = getSimplifiedAnalytics();
        const currentParams = analytics.params;

        // 計算預期速度與電量，並注入 currentParams 以確保滑桿變動時能觸發重傳
        const speedMagnitude = parseFloat(document.getElementById('speedSlider')?.value || "0.1");
        const batteryLevel = Math.max(0, Math.min(1, (speedMagnitude - 0.1) / 0.1));
        currentParams.batteryPct = Math.round(batteryLevel * 100);
        const expectedSpeed = (28.7 + 32 * batteryLevel).toFixed(1);

        const currentParamsJson = JSON.stringify(currentParams);

        // --- 影像節流控制 (Image Throttling) ---
        const visualKeywords = ["看", "圖", "連續攝影", "照片", "截圖", "軌跡", "步態"];
        const hasVisualKeyword = visualKeywords.some(kw => userText.includes(kw));

        const stateChanged = (analytics.symptom.isClashing !== this.lastIsClashing) || (analytics.symptom.isStable !== this.lastIsStable);

        const shouldSendImage = 
            (currentParamsJson !== this.lastSentParamsJson) || 
            stateChanged || 
            hasVisualKeyword || 
            this.history.length < 3;

        this.updateStatus("看診中...");
        let imageData = null;
        if (shouldSendImage) {
            imageData = await this.captureCanvas(currentParamsJson);
        }
        
        this.lastIsClashing = analytics.symptom.isClashing;
        this.lastIsStable = analytics.symptom.isStable;

        // --- 核心機械構造規格手冊 (System Prompt - Static Prefix) ---
        const systemPrompt = `${STATIC_COSTAR_PROMPT}\n\n${KINEMATICS_REFERENCE}`;

        // --- 當前背景數據 (Dynamic Context) ---
        let robotStateXml = "";
        let visualPrompt = imageData ? "\n  <Visual_Instruction>請觀察附件中的連續攝影 (Chronophotograph) ，依據腳印的分布與機身的高低起伏來輔助你的診斷。</Visual_Instruction>" : "";

        // --- 計算參數變動差異 (Parameter Delta) ---
        const baseline = {
            legLength: 25, footLength: 20, blueLink: 55, bodyWidth: 48, crankRadius: 6.5, phaseDiff: 180, gearboxShift: 0
        };
        const deltaStrs = Object.keys(baseline).map(key => {
            const curr = currentParams[key];
            const base = baseline[key];
            if (curr > base) return `${key}: ${curr} (基準 ${base}，增加)`;
            if (curr < base) return `${key}: ${curr} (基準 ${base}，減少)`;
            return `${key}: ${curr} (無變動)`;
        });
        const parameterDeltaStr = deltaStrs.join(", ");

        // 計算物理指標變化量 (Delta)
        let metricsDeltaStr = "無前次指標對照";
        if (this.lastMetrics) {
            const dSpeed = (analytics.symptom.speed - this.lastMetrics.speed).toFixed(1);
            const dHop = (analytics.symptom.hopRange - this.lastMetrics.hopRange).toFixed(1);
            metricsDeltaStr = `速度變化: ${dSpeed > 0 ? '+' : ''}${dSpeed} mm/s, 顛簸變化: ${dHop > 0 ? '+' : ''}${dHop} mm`;
        }
        this.lastMetrics = {
            speed: analytics.symptom.speed,
            hopRange: analytics.symptom.hopRange
        };

        // 參數極限值檢測與標記
        const limits = {
            legLength: { min: 10, max: 60 },
            footLength: { min: 19, max: 100 },
            blueLink: { min: 40, max: 100 },
            bodyWidth: { min: 20, max: 80 },
            crankRadius: { min: 6, max: 20 },
            phaseDiff: { min: 0, max: 180 },
            gearboxShift: { min: -10, max: 10 }
        };
        const getParamStr = (key, name) => {
            const val = currentParams[key];
            const lim = limits[key];
            if (lim) {
                if (val <= lim.min) return `${name}=${val} (已達最小值 ${lim.min})`;
                if (val >= lim.max) return `${name}=${val} (已達最大值 ${lim.max})`;
            }
            return `${name}=${val}`;
        };

        // 只有在參數變動、有結構衝突、或是歷史紀錄很短時，才發送完整物理數據
        if (currentParamsJson !== this.lastSentParamsJson || analytics.symptom.isClashing || this.history.length < 3) {
            robotStateXml = `
<Robot_State>
  <Analytics_Data>卡死=${analytics.symptom.isClashing}, 穩定=${analytics.symptom.isStable}, 實際速度=${analytics.symptom.speed} mm/s, 顛簸程度=${analytics.symptom.hopRange} mm, 目前電量=${currentParams.batteryPct}%, 該電量預期速度=${expectedSpeed} mm/s</Analytics_Data>
  <Parameter_Delta>當前滑桿偏離基準狀況：${parameterDeltaStr} | 物理指標變化：${metricsDeltaStr}</Parameter_Delta>
  <Mechanical_Params>${getParamStr('legLength', '腳長')}, ${getParamStr('footLength', '機器人高度')}, ${getParamStr('blueLink', '藍色直桿')}, ${getParamStr('bodyWidth', '身體半寬')}, ${getParamStr('crankRadius', '曲柄半徑 R')}, ${getParamStr('phaseDiff', '相位差')}°, ${getParamStr('gearboxShift', '齒輪箱位移')}</Mechanical_Params>
  <Performance_Baseline>馬達轉速=${currentParams.motorTargetSpeed} rad/s, 理論空載速度(Expected Normal Speed)=${currentParams.expectedNormalSpeed} mm/s</Performance_Baseline>
  <Posture_Criteria>判斷姿勢：請比較「實際速度」與「該電量預期速度」。若實際速度低於預期速度，代表步態可能打滑或不佳；若相近或超越，則代表步態優良且高效率。</Posture_Criteria>${visualPrompt}
</Robot_State>`;
            this.lastSentParamsJson = currentParamsJson;
        } else {
            robotStateXml = `<Robot_State>\n  <Info>機械參數與電量維持不變，持續觀察中</Info>${visualPrompt}\n</Robot_State>`;
        }

        let tailInstruction = `\n<Tail_Instruction>\n系統強制提醒：請務必遵守 COSTAR 框架，並根據 Kinematics_Reference.md 的原則進行引導提問！主文限 50 字內，針對「單一」最致命問題給予適當的引導或回饋。回覆最後必須提供恰好 3 個「💬 建議回覆選項按鈕」。`;
        tailInstruction += `\n【重要】如果學生目前處於 Scenario A（卡關、表示不知道、不懂概念或詢問定義），請啟動「僅作解釋，不問問題」策略：主文僅使用 1 句生活譬喻來建構概念，嚴禁使用任何問句結尾，並直接提供建議選項。`;
        tailInstruction += `\n</Tail_Instruction>`;

        // Stage 4: 自適應降級 (Adaptive Scaffolding)
        if (this.frustrationCount >= 2) {
            tailInstruction += `\n【自適應降級觸發】學生連續表示不知道或卡關。請立刻降低提問難度！改用具體的「A/B選擇題」或是「明確的參數調整指示」，禁止再使用開放式問句。`;
        }

        // 組裝傳給 AI 的完整 User Text，包含狀態、User Input 與 Tail Instruction
        const finalUserText = `${robotStateXml}\n\n<Student_Input>\n${userText}\n</Student_Input>\n${tailInstruction}`;

        // 紀錄本次通訊到歷史卡片 (偵錯用)
        const historyToSend = this.history.slice(0, -1);
        const historyText = historyToSend.map(h => `[${h.role.toUpperCase()}]: ${h.parts[0].text}`).join('\n');

        const throttlingReason = shouldSendImage 
            ? "已觸發：狀態改變 / 關鍵字 / 歷史短" 
            : "未觸發：狀態無變動且無關鍵字";

        this.debugHistory.push({
            timestamp: Date.now(),
            content: `[SYSTEM METRICS]
Frustration Count: ${this.frustrationCount} ${this.frustrationCount >= 2 ? '(⚠️ 降級觸發)' : ''}
Image Throttling: ${shouldSendImage ? '🔴 傳送截圖' : '🟢 節流 (無截圖)'}
Reason: ${throttlingReason}

[STATIC PROMPT PREFIX (Cached)]
<Role_And_Rules & Domain_Knowledge & Kinematics_Reference (Cached)>

[HISTORY]
${historyText || '(無歷史紀錄)'}

[DYNAMIC CONTEXT & USER INPUT]
${finalUserText}${imageData ? `\n\n[IMAGE SENT]\n<img src="${imageData}" style="width:100%; border-radius:8px; margin-top:10px; border:1px solid #444;">` : ''}`
        });
        this.currentLogIndex = this.debugHistory.length - 1;
        this.renderDebugCard();

        try {
            const rawResponse = await this.callGeminiAPI(systemPrompt, finalUserText, historyToSend, imageData);
            
            // Stage 3: 防禦性解析器 (Defensive Parser)
            const lines = rawResponse.split('\n');
            const mainTextLines = [];
            const options = [];

            for (const line of lines) {
                const trimmed = line.trim();
                // Match exact symbol or standard markdown options as fallback
                if (trimmed.startsWith('💬') || trimmed.startsWith('- 💬')) {
                    options.push(trimmed.replace(/^- /, '').trim());
                } else if (trimmed !== '' && !trimmed.includes('建議回覆選項') && !trimmed.startsWith('---')) {
                    mainTextLines.push(trimmed);
                }
            }

            // 安全隔離網觸發狀態 (Safety Guardrail UX) - 若無按鈕則加上保底按鈕
            if (options.length === 0) {
                options.push('💬 我不太懂，請再解釋一次');
                options.push('💬 我們來試試別的');
                options.push('💬 回到機器人實驗');
            }

            const mainText = mainTextLines.join('<br>');
            this.addMessage('ai', mainText, options);

        } catch (error) {
            console.error("[ChatManager] API Error:", error);
            this.addMessage('ai', "哎呀！我的大腦齒輪卡住了，請再試一次！✨", ["💬 重新傳送", "💬 回到機器人實驗"]);
        }

        this.isWaiting = false;
        this.updateStatus("醫生待命中...");
    },




    async callGeminiAPI(systemPrompt, userText, history = [], imageData = null) {
        // 改為呼叫 Vercel Serverless Function
        const url = '/api/chat';

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemPrompt, userText, history, imageData })
        });

        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();

        // 解析 Gemini 回傳格式 (對應 /api/chat.js 的回傳)
        if (data.candidates && data.candidates[0].content.parts[0].text) {
            return data.candidates[0].content.parts[0].text;
        }

        throw new Error("Invalid API response format");
    },

    useMockResponse(analytics, isAutoTrigger) {
        let response = "";
        if (analytics.physics.hasConflict) {
            response = "哎呀！零件卡住了！快點把曲柄 R 調小一點，或是調整腿長試試看！⚙️";
        } else if (isAutoTrigger) {
            response = "嘿！我發現你調整了參數！機器人現在動得很特別喔，要不要試試看不同的相位差？✨";
        } else {
            response = "我是小六！現在機械人看起來很穩定，你還可以試著調整腿長，看看能跑多快！🤖";
        }
        this.addMessage('ai', response);
    }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => ChatManager.init());