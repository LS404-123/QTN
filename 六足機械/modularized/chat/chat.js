/**
 * AI Chat Logic - 🤖 小六 AI 診斷助手
 */
import { getDiagnosticState } from '../simulation/simulation.js';
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
    lastSteadyImage: null, // 儲存修改前的穩定影像

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
    /**
     * 格式化偵錯輸出的 Prompt 內容 (僅美化顯示，不改變原始發送字串)
     */
    formatDebugPrompt(content) {
        // 1. 基本 HTML 轉義，防止被瀏覽器當作 HTML 解析
        let escaped = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // 2. 針對特定標籤做排版美化 (如 Analytics_Data, Parameter_Delta 等)
        const tagsToTidy = [
            'Analytics_Data', 
            'Parameter_Delta', 
            'Mechanical_Params', 
            'Performance_Baseline'
        ];

        tagsToTidy.forEach(tag => {
            const regex = new RegExp(`(&lt;${tag}&gt;)(.*?)(&lt;\\/${tag}&gt;)`, 'gs');
            escaped = escaped.replace(regex, (match, openTag, body, closeTag) => {
                let tidiedBody = body.trim();

                if (tag === 'Parameter_Delta') {
                    // 切割 "|" 與 逗號項目
                    const sections = tidiedBody.split('|').map(section => {
                        const cleanSec = section.trim();
                        if (cleanSec.includes('當前滑桿偏離基準狀況：')) {
                            const detail = cleanSec.replace('當前滑桿偏離基準狀況：', '').trim();
                            const bulletList = detail.split(',').map(item => `    • ${item.trim()}`).join('\n');
                            return `  當前滑桿偏離基準狀況：\n${bulletList}`;
                        }
                        if (cleanSec.includes('物理指標變化：')) {
                            const detail = cleanSec.replace('物理指標變化：', '').trim();
                            const bulletList = detail.split(',').map(item => `    • ${item.trim()}`).join('\n');
                            return `  物理指標變化：\n${bulletList}`;
                        }
                        return `  ${cleanSec}`;
                    });
                    tidiedBody = '\n' + sections.join('\n') + '\n';
                } else {
                    // 對於其餘逗號分隔的標籤，轉成換行點列
                    const listItems = tidiedBody.split(',').map(item => `  • ${item.trim()}`).join('\n');
                    tidiedBody = '\n' + listItems + '\n';
                }

                return `${openTag}${tidiedBody}${closeTag}`;
            });
        });

        // 3. XML 標籤語法高亮
        escaped = escaped.replace(/(&lt;\/[a-zA-Z_]+&gt;)/g, '<span style="color: #38bdf8; font-weight: bold; opacity: 0.85;">$1</span>');
        escaped = escaped.replace(/(&lt;[a-zA-Z_]+&gt;)/g, '<span style="color: #38bdf8; font-weight: bold;">$1</span>');
        
        // 4. 對特定的屬性鍵值進行簡單高亮
        escaped = escaped.replace(/([^ \n\t&<>:=]+)([:=])(true|false|-?[0-9.]+(?:[^,\n\r&<>]*))/g, 
            '<span style="color: #94a3b8;">$1</span>$2<span style="color: #fbbf24; font-weight: bold;">$3</span>');

        return escaped;
    },

    /**
     * 渲染當前的偵錯卡片
     */
    renderDebugCard() {
        if (!this.debugCardContainer || this.currentLogIndex === -1) return;

        const log = this.debugHistory[this.currentLogIndex];
        const timeStr = new Date(log.timestamp).toLocaleTimeString();
        const formattedContent = this.formatDebugPrompt(log.content);

        this.debugCardContainer.innerHTML = `
            <div class="debug-card">
                <span class="debug-time">[${timeStr}] 📡 傳輸批次 #${this.currentLogIndex + 1}</span>
                ${formattedContent}
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

        const escapedText = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');

        msgDiv.innerHTML = `
            <div class="msg-avatar">${role === 'ai' ? '🤖' : '👤'}</div>
            <div class="msg-content">${escapedText}</div>
        `;

        // Stage 3: 動態按鈕渲染
        if (this.suggestedOptionsContainer) {
            this.suggestedOptionsContainer.innerHTML = ''; // 每次有新訊息先清空
            this.suggestedOptionsContainer.style.display = 'none';
            if (options && options.length > 0) {
                this.suggestedOptionsContainer.style.display = 'flex';
                options.forEach(optText => {
                    const btn = document.createElement('button');
                    btn.className = 'suggested-reply-btn';
                    // Inline styles for horizontal row layout
                    btn.style.flex = '1 1 calc(33.33% - 6px)';
                    btn.style.minWidth = '0';
                    btn.style.padding = '6px 8px';
                    btn.style.borderRadius = '12px';
                    btn.style.border = '1px solid rgba(74, 222, 128, 0.8)';
                    btn.style.background = 'rgba(74, 222, 128, 0.15)';
                    btn.style.color = '#166534'; // 深綠色，確保在淺色背景上顯示清楚
                    btn.style.fontWeight = '600';
                    btn.style.cursor = 'pointer';
                    btn.style.textAlign = 'center';
                    btn.style.fontSize = '0.78rem';
                    btn.style.lineHeight = '1.2';
                    btn.style.whiteSpace = 'normal';
                    btn.style.wordBreak = 'break-word';
                    btn.style.transition = 'all 0.2s';
                    
                    btn.onmouseover = () => btn.style.background = 'rgba(74, 222, 128, 0.3)';
                    btn.onmouseout = () => btn.style.background = 'rgba(74, 222, 128, 0.15)';
                    
                    btn.innerText = optText;
                    btn.onclick = () => {
                        this.suggestedOptionsContainer.innerHTML = '';
                        this.suggestedOptionsContainer.style.display = 'none';
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
            if (text.includes("思考中")) dotEl.classList.add('thinking');
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
            this.suggestedOptionsContainer.style.display = 'none';
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

        const analytics = getDiagnosticState();
        const currentParams = analytics.params;
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

        this.updateStatus("思考中...");
        let imagesToSend = [];
        if (shouldSendImage) {
            const newImage = await this.captureCanvas(currentParamsJson);
            if (this.lastSteadyImage) {
                imagesToSend.push(this.lastSteadyImage);
            }
            if (newImage) {
                imagesToSend.push(newImage);
            }
            this.lastSteadyImage = newImage;
        }
        
        this.lastIsClashing = analytics.symptom.isClashing;
        this.lastIsStable = analytics.symptom.isStable;

        // --- 核心機械構造規格手冊 (System Prompt - Static Prefix) ---
        const systemPrompt = `${STATIC_COSTAR_PROMPT}\n\n${KINEMATICS_REFERENCE}`;

        // --- 當前背景數據 (Dynamic Context) ---
        let robotStateXml = "";
        let visualPrompt = imagesToSend.length > 1 ? "\n  <Visual_Instruction>請觀察附件中的連續攝影，圖1 為修改前的狀態，圖2 為修改後的狀態。請對比腳印的分布與機身高低起伏，判斷學生的改動是否改善了步態。</Visual_Instruction>" 
                         : (imagesToSend.length === 1 ? "\n  <Visual_Instruction>請觀察附件中的連續攝影，依據腳印的分布與機身的高低起伏來輔助你的診斷。</Visual_Instruction>" : "");

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

        const getParamStr = (key, name) => {
            const val = currentParams[key];
            const limitStatus = analytics.symptom.limitsReached[key];
            if (limitStatus === "min") return `${name}=${val} (已達最小值)`;
            if (limitStatus === "max") return `${name}=${val} (已達最大值)`;
            return `${name}=${val}`;
        };

        // 只有在參數變動、有結構衝突、或是歷史紀錄很短時，才發送完整物理數據
        if (currentParamsJson !== this.lastSentParamsJson || analytics.symptom.isClashing || this.history.length < 3) {
            robotStateXml = `
<Robot_State>
  <Analytics_Data>卡死=${analytics.symptom.isClashing}, 穩定=${analytics.symptom.isStable}, 實際速度=${analytics.symptom.speed} mm/s, 顛簸程度=${analytics.symptom.hopRange} mm, 目前電量=${currentParams.batteryPct}%, 該電量預期速度=${currentParams.expectedNormalSpeed} mm/s</Analytics_Data>
  <Parameter_Delta>當前滑桿偏離基準狀況：${parameterDeltaStr} | 物理指標變化：${metricsDeltaStr}</Parameter_Delta>
  <Golden_Rule_Error>${analytics.symptom.goldenRuleError} (違反=${analytics.symptom.isGoldenRuleViolated})</Golden_Rule_Error>
  <Mechanical_Params>${getParamStr('legLength', '腿長')}, ${getParamStr('footLength', '腳長/機器人高度')}, ${getParamStr('blueLink', '藍色直桿')}, ${getParamStr('bodyWidth', '身體半寬')}, ${getParamStr('crankRadius', '曲柄半徑')}, ${getParamStr('phaseDiff', '相位差')}°, ${getParamStr('gearboxShift', '齒輪箱位移')}</Mechanical_Params>
  <Performance_Baseline>馬達轉速=${currentParams.motorTargetSpeed} rad/s, 理論空載速度(Expected Normal Speed)=${currentParams.expectedNormalSpeed} mm/s, 預期重心起伏=${analytics.symptom.expectedHop} mm, 異常顛簸=${analytics.symptom.hasAbnormalBobbing}</Performance_Baseline>
  <Posture_Criteria>判斷姿勢：請比較「實際速度」與「理論空載速度」。若實際速度低於理論值，代表步態可能打滑或不佳；若相近或超越，則代表步態優良且高效率。</Posture_Criteria>${visualPrompt}
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
${finalUserText}${imagesToSend.length > 0 ? `\n\n[IMAGES SENT: ${imagesToSend.length}]` : ''}`
        });
        this.currentLogIndex = this.debugHistory.length - 1;
        this.renderDebugCard();

        try {
            const rawResponse = await this.callGeminiAPI(systemPrompt, finalUserText, historyToSend, imagesToSend);
            
            // Stage 3: 防禦性解析器升級為 Structured Outputs (JSON Schema)
            let mainText = "";
            let options = [];
            try {
                const parsed = JSON.parse(rawResponse);
                mainText = parsed.mainText || "系統回覆解析異常。";
                options = parsed.suggestedReplies || [];
            } catch (e) {
                console.error("JSON Parse Error:", e);
                mainText = rawResponse; // 降級顯示
            }

            // 安全隔離網觸發狀態 (Safety Guardrail UX) - 若無按鈕則加上保底按鈕
            if (options.length === 0) {
                options.push('💬 我不太懂，請再解釋一次');
                options.push('💬 我們來試試別的');
                options.push('💬 回到機器人實驗');
            }

            // 將原始文字傳入，由 addMessage 處理 HTML 轉義與換行，避免對話歷史儲存 <br>
            this.addMessage('ai', mainText, options);

        } catch (error) {
            console.error("[ChatManager] API Error:", error);
            this.addMessage('ai', "哎呀！我的大腦齒輪卡住了，請再試一次！✨", ["💬 重新傳送", "💬 回到機器人實驗"]);
        }

        this.isWaiting = false;
        this.updateStatus("老師待命中...");
    },




    async callGeminiAPI(systemPrompt, userText, history = [], images = []) {
        // 改為呼叫 Vercel Serverless Function
        const url = '/api/chat';

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemPrompt, userText, history, images })
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