/**
 * AI Chat Logic - 🤖 小六 AI 診斷助手
 * 負責處理 UI 互動、數據轉譯、以及串接 Vercel Serverless API
 */

const ChatManager = {
    history: [],
    isWaiting: false,
    suggestionCooldown: false,
    isFirstRequest: true,
    lastParams: {},
    debugHistory: [],
    currentLogIndex: -1,

    init() {
        this.chatHistory = document.getElementById('chatHistory');
        this.userInput = document.getElementById('userInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.debugCardContainer = document.getElementById('debugCardContainer');
        this.logCounter = document.getElementById('logCounter');
        this.prevLogBtn = document.getElementById('prevLog');
        this.nextLogBtn = document.getElementById('nextLog');

        if (!this.chatHistory || !this.userInput || !this.sendBtn) return;

        this.sendBtn.addEventListener('click', () => this.handleSendMessage());
        this.userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSendMessage();
        });

        this.prevLogBtn?.addEventListener('click', () => this.showLog(this.currentLogIndex - 1));
        this.nextLogBtn?.addEventListener('click', () => this.showLog(this.currentLogIndex + 1));

        window.onSliderChanged = (id, value) => this.handleSliderChange(id, value);
    },

    showLog(index) {
        if (index < 0 || index >= this.debugHistory.length) return;
        this.currentLogIndex = index;
        this.renderDebugCard();
    },

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

    async handleSendMessage() {
        const text = this.userInput.value.trim();
        if (!text || this.isWaiting) return;
        this.userInput.value = '';
        this.addMessage('user', text);
        await this.getAIResponse(text);
    },

    handleSliderChange(id, value) {
        if (this.suggestionCooldown) return;
        this.suggestionCooldown = true;
        this.updateStatus("休息中...");

        setTimeout(() => {
            this.suggestionCooldown = false;
            if (!this.isWaiting) this.updateStatus("觀察中...");
        }, 5000);

        let triggerText = "";
        const val = Math.round(value);

        const triggers = {
            lLegSlider: `我發現你把「腿長」調到了 ${val}！這樣走路會有什麼變化呢？`,
            lFootSlider: `「腳掌長度」變成了 ${val}，這會讓它站得更穩嗎？`,
            lBlueSlider: `你調整了「藍色連桿」長度為 ${val}，這會改變腳抬起的高度喔！`,
            sSlider: `「支架寬度 S」現在是 ${val}，這對重心有什麼影響呢？`,
            gearboxShiftSlider: `你移動了「齒輪箱位置」，這會改變曲柄半徑 R 喔！`,
            crankHole: `你把曲柄孔位換到了第 ${val} 孔，這會大幅改變步伐的大小喔！`,
            phaseSlider: `相位差調成 ${val} 度了！機器人走路的姿勢好像變了耶。`,
            speedSlider: `模擬速度變快了，幫我觀察一下穩定度。`
        };

        triggerText = triggers[id];
        if (triggerText) this.getAIResponse(triggerText, true);
    },

    async getAIResponse(userText, isAutoTrigger = false) {
        this.isWaiting = true;
        this.updateStatus("思考中...");

        const analytics = getSimplifiedAnalytics();
        const currentParams = analytics.params;
        let promptBody = "";

        if (this.isFirstRequest) {
            promptBody = `你是一個名叫「小六」的機器人助手。目前環境：腿長 ${currentParams.legLength}, 腳掌 ${currentParams.footLength}, 藍色連桿 ${currentParams.blueLink}, 曲柄 ${currentParams.crankRadius}。狀態：${analytics.physics.hasConflict ? "⚠️卡死" : "✅正常"}。請用活潑語氣回覆，80字內。✨`;
            this.isFirstRequest = false;
        } else {
            let changedDesc = "";
            const paramNames = { legLength: "腿長", footLength: "腳掌", blueLink: "藍連桿", crankRadius: "曲柄" };
            for (let key in paramNames) {
                if (Math.abs(this.lastParams[key] - currentParams[key]) > 0.1) {
                    changedDesc += `${paramNames[key]}變為 ${currentParams[key]}, `;
                }
            }
            promptBody = `【變動】${changedDesc || "微調"} 【狀態】衝突: ${analytics.physics.hasConflict ? "⚠️是" : "✅否"}。分析變化，80字內。✨`;
        }

        this.lastParams = { ...currentParams };
        this.debugHistory.push({ timestamp: Date.now(), content: `[PROMPT] ${promptBody.trim()}\n[USER] ${userText}` });
        this.renderDebugCard();

        try {
            const response = await this.callGeminiAPI(promptBody, userText);
            this.addMessage('ai', response);
        } catch (error) {
            console.error("[ChatManager] API Error:", error);
            this.addMessage('ai', "哎呀！大腦連線稍微卡住了，我先用預設回應喔！✨");
            this.useMockResponse(analytics, isAutoTrigger);
        }

        this.isWaiting = false;
        this.updateStatus(this.suggestionCooldown ? "休息中..." : "觀察中...");
    },

    async callGeminiAPI(systemPrompt, userText) {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemPrompt, userText })
        });

        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "抱歉，我現在無法思考。";
    },

    useMockResponse(analytics, isAutoTrigger) {
        let response = analytics.physics.hasConflict
            ? "哎呀！零件卡住了！快點把曲柄 R 調小一點試試看！⚙️"
            : (isAutoTrigger ? "嘿！我發現你調整了參數！要不要試試看不同的相位差？✨" : "我是小六！現在機械人看起來很穩定！🤖");
        this.addMessage('ai', response);
    }
};

document.addEventListener('DOMContentLoaded', () => ChatManager.init());
*