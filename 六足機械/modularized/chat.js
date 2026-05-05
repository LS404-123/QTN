/**
 * AI Chat Logic - 🤖 小六 AI 診斷助手
 * 負責處理 UI 互動、數據轉譯、以及串接 Gemini API
 */

const ChatManager = {
    history: [],
    isWaiting: false,
    suggestionCooldown: false,
    isFirstRequest: true, // 是否為首次請求
    lastParams: {},      // 紀錄上次參數
    debugHistory: [],    // 新增：儲存偵錯歷史
    currentLogIndex: -1, // 新增：當前顯示的日誌索引

    init() {
        console.log("[ChatManager] Initializing...");
        this.chatHistory = document.getElementById('chatHistory');
        this.userInput = document.getElementById('userInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.debugCardContainer = document.getElementById('debugCardContainer');
        this.logCounter = document.getElementById('logCounter');
        this.prevLogBtn = document.getElementById('prevLog');
        this.nextLogBtn = document.getElementById('nextLog');

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

        // 監聽滑桿變動 (由 simulation.js 觸發)
        window.onSliderChanged = (id, value) => {
            this.handleSliderChange(id, value);
        };

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
    addMessage(role, text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role === 'ai' ? 'ai-msg' : 'user-msg'}`;

        msgDiv.innerHTML = `
            <div class="msg-avatar">${role === 'ai' ? '🤖' : '👤'}</div>
            <div class="msg-content">${text}</div>
        `;

        this.chatHistory.appendChild(msgDiv);
        this.chatHistory.scrollTop = this.chatHistory.scrollHeight;

        this.history.push({ role, text });
        if (this.history.length > 10) this.history.shift();
    },

    /**
     * 更新狀態文字
     */
    updateStatus(text) {
        const statusEl = document.querySelector('.status-text');
        const dotEl = document.querySelector('.status-dot');
        if (statusEl) statusEl.innerText = text;

        if (dotEl) {
            dotEl.classList.remove('resting', 'thinking');
            if (text.includes("休息中")) dotEl.classList.add('resting');
            if (text.includes("思考中")) dotEl.classList.add('thinking');
        }
    },


    /**
     * 處理用戶手動發送訊息
     */
    async handleSendMessage() {
        const text = this.userInput.value.trim();
        if (!text || this.isWaiting) return;

        this.userInput.value = '';
        this.addMessage('user', text);
        await this.getAIResponse(text);
    },

    /**
     * 處理滑桿變動 (半主動模式)
     */
    handleSliderChange(id, value) {
        if (this.suggestionCooldown) return;

        this.suggestionCooldown = true;

        // 啟動冷卻計時 (UI 顯示休息中)
        this.updateStatus("休息中...");
        setTimeout(() => {
            this.suggestionCooldown = false;
            if (!this.isWaiting) this.updateStatus("觀察中...");
        }, 5000);



        let triggerText = "";
        const val = Math.round(value);


        if (id === 'lLegSlider') {
            triggerText = `我發現你把「腿長」調到了 ${val}！這樣走路會有什麼變化呢？`;
        } else if (id === 'lFootSlider') {
            triggerText = `「腳掌長度」變成了 ${val}，這會讓它站得更穩嗎？`;
        } else if (id === 'lBlueSlider') {
            triggerText = `你調整了「藍色連桿」長度為 ${val}，這會改變腳抬起的高度喔！`;
        } else if (id === 'sSlider') {
            triggerText = `「支架寬度 S」現在是 ${val}，這對重心有什麼影響呢？`;
        } else if (id === 'gearboxShiftSlider') {
            triggerText = `你移動了「齒輪箱位置」，這會改變曲柄半徑 R 喔！幫我看看有沒有卡住。`;
        } else if (id === 'crankHole') {
            triggerText = `你把曲柄孔位換到了第 ${val} 孔，這會大幅改變步伐的大小喔！`;
        } else if (id === 'phaseSlider') {

            triggerText = `相位差調成 ${val} 度了！機器人走路的姿勢好像變了耶。`;
        } else if (id === 'simSpeedSlider' || id === 'speedSlider') {
            triggerText = `模擬速度變快了，幫我觀察一下穩定度。`;
        }

        if (triggerText) {
            console.log(`[ChatManager] Auto-triggering AI for: ${id}`);
            this.getAIResponse(triggerText, true);
        }
    },


    /**
     * 獲取 AI 回應 (增量更新模式)
     */
    async getAIResponse(userText, isAutoTrigger = false) {
        this.isWaiting = true;
        this.updateStatus("思考中...");

        const analytics = getSimplifiedAnalytics();
        const currentParams = analytics.params;
        let promptBody = "";

        if (this.isFirstRequest) {
            // ... 首次請求邏輯保持不變 ...
            promptBody = `你是一個名叫「小六」的六足機器人助手，專門指導國小學生。你正身處於一個「2D 幾何連桿模擬器」中。

【模擬器原理】
1. 機構：透過曲柄 (R) 旋轉帶動藍色連桿與腿部進行橢圓形運動。
2. 步態：機器人有「近端 (Near)」與「遠端 (Far)」兩組腿，每組三條。
3. 物理：若零件長度不匹配，會導致「三角形幾何約束」崩潰而卡死。

【完整物理參數】
- 腿長: ${currentParams.legLength}, 腳掌: ${currentParams.footLength}, 藍色連桿: ${currentParams.blueLink}, 身體寬度: ${currentParams.bodyWidth}, 曲柄(R): ${currentParams.crankRadius}, 相位差: ${currentParams.phaseDiff}°

【目前的動態狀態】
- 結構衝突: ${analytics.physics.hasConflict ? "⚠️ 是 (卡死)" : "✅ 否"}
- 身體跳動幅度: ${analytics.physics.hopRange}
- 穩定度評價: ${analytics.physics.stability}

【對話規則】
1. 專注本職：只回答與此「2D 幾何連桿模擬器」及「機器人運動科學」相關的問題。
2. 委婉拒絕：若使用者詢問無關話題（如數學、天氣等），請用活潑語氣拒絕並導回機器人科學。
3. 幽默、愛用比喻。每次只聚焦一個重點。
4. 優先級：幾何衝突 > 跳動過大 > 其他分析。
5. 語氣簡單，回覆在 80 字內。必須包含一個 Emoji。✨`;

            this.isFirstRequest = false;
        } else {
            // --- 後續請求：精確對比變動 ---
            const paramNames = {
                legLength: "腿長",
                footLength: "腳掌長",
                blueLink: "藍色連桿",
                bodyWidth: "身體寬度",
                crankRadius: "曲柄半徑(R)",
                phaseDiff: "相位差"
            };

            let changedDesc = "";
            for (let key in paramNames) {
                const oldVal = this.lastParams[key];
                const newVal = currentParams[key];

                // 使用門檻值判斷，避免 20.000000001 !== 20 的問題
                if (oldVal !== undefined && Math.abs(oldVal - newVal) > 0.1) {
                    changedDesc += `${paramNames[key]}變為 ${newVal}, `;
                }
            }

            promptBody = `【參數變動】${changedDesc || "微調參數"}
【狀態】衝突: ${analytics.physics.hasConflict ? "⚠️是" : "✅否"}, 穩定: ${analytics.physics.stability}
【任務】分析上述變化。保持小六人格，80 字內。✨`;
        }

        this.lastParams = { ...currentParams };

        // 紀錄本次通訊到歷史卡片
        this.debugHistory.push({
            timestamp: Date.now(),
            content: `[PROMPT SENT]\n${promptBody.trim()}\n\n[USER INPUT]\n${userText}`
        });
        this.currentLogIndex = this.debugHistory.length - 1;
        this.renderDebugCard();


        if (typeof CONFIG !== 'undefined' && CONFIG.GEMINI_API_KEY && CONFIG.GEMINI_API_KEY !== "在此填入你的_API_KEY") {
            try {
                const response = await this.callGeminiAPI(promptBody, userText);
                this.addMessage('ai', response);
            } catch (error) {
                console.error("[ChatManager] API Error:", error);
                this.addMessage('ai', "哎呀！大腦連線失敗，我們先用預設回應喔！");
                this.useMockResponse(analytics, isAutoTrigger);
            }
        } else {
            setTimeout(() => this.useMockResponse(analytics, isAutoTrigger), 800);
        }

        this.isWaiting = false;

        // 關鍵修正：回應結束後，根據冷卻狀態切換燈號
        if (this.suggestionCooldown) {
            this.updateStatus("休息中...");
        } else {
            this.updateStatus("觀察中...");
        }
    },




    async callGeminiAPI(systemPrompt, userText) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.MODEL_NAME}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
        const body = {
            contents: [{
                parts: [{ text: `${systemPrompt}\n\n用戶輸入：${userText}` }]
            }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 150
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
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
