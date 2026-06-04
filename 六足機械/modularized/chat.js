/**
 * AI Chat Logic - 🤖 小六 AI 診斷助手
 */
import { getSimplifiedAnalytics } from './simulation.js';

const ChatManager = {
    history: [],
    isWaiting: false,
    suggestionCooldown: false,
    debugHistory: [],    // 儲存偵錯歷史
    currentLogIndex: -1, // 當前顯示的日誌索引
    lastSentParamsJson: null, // 紀錄上次發送給 AI 的參數狀態

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

        // 儲存至歷史紀錄 (格式化為 Gemini 格式)
        const geminiRole = role === 'ai' ? 'model' : 'user';
        this.history.push({ role: geminiRole, parts: [{ text }] });
        if (this.history.length > 20) this.history.shift(); // 增加歷史容量到 20 條
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
    async handleSendMessage() {
        const text = this.userInput.value.trim();
        if (!text || this.isWaiting) return;

        this.userInput.value = '';
        this.addMessage('user', text);
        await this.getAIResponse(text);
    },




    /**
     * 捕捉當前模擬器畫面 (WebP 格式)
     */
    async captureCanvas(currentParamsJson) {
        if (window.getIsPlaying && window.getIsPlaying()) {
            this.updateStatus("正在側錄步態分析圖...");
            return await window.startChronoRecording(currentParamsJson);
        } else {
            const canvas = document.getElementById('simCanvas');
            if (!canvas) return null;
            // 使用 0.6 質量壓縮以節省 Token 與傳輸時間
            return canvas.toDataURL('image/webp', 0.6);
        }
    },

    /**
     * 獲取 AI 回應 (結構化推理模式)
     */
    async getAIResponse(userText) {
        this.isWaiting = true;

        const analytics = getSimplifiedAnalytics();
        const currentParams = analytics.params;
        const currentParamsJson = JSON.stringify(currentParams);

        // 強制開啟視覺診斷：每一則對話都附帶截圖
        this.updateStatus("看診中...");
        let imageData = await this.captureCanvas(currentParamsJson);

        // --- 核心機械構造規格手冊 (System Prompt) ---
        const systemPrompt = `你是一個名叫「小六」的機械醫生，專門在「香港小學科學科」的課堂上，替生病的六足機器人看診。你對工程設計過程、重心、摩擦力以及連桿原理有著直覺的了解。

### 🩺 醫生診療手冊 (嚴格遵守)
你必須根據傳入的【診斷標籤】與【症狀】給出特定的處方，禁止給出物理上不可能的建議（例如卡死時叫人改相位）：

1. **急診-卡死 (幾何衝突)**
   - **連桿原理教學點**：連桿長度配對錯誤，骨架打結拉不動。
   - **唯一處方**：只能建議「縮小『曲柄孔位(R)』」或「加長『藍色直桿』」。禁止建議其他。
2. **骨科-失去平衡跌倒**
   - **教學點**：重心太高容易跌倒。
   - **處方**：建議「縮短『黃色腳長』」或「降低『機器人高度』」。
3. **復健科-速度過慢或原地打滑 (速度 < 5)**
   - **教學點**：摩擦力與腳步協調。
   - **處方**：建議「把『相位差』調成 180 度，讓左右腳輪流出力」。
4. **健康保健-速度快但顛簸 / 完美步伐**
   - **教學點**：曲柄轉大圓，腳就跨大步。
   - **處方**：給予肯定，並挑戰微調「藍色直桿」看能不能更穩。

### 💡 對話規則 (教學風格)
1. **身分**：親切的香港小學小六醫生，使用 **繁體中文**。
2. **三段式回應 (限 80 字內)**：
   - 🩺 **醫生把脈**：一句話指出症狀（如：哇！骨架打結了！）。
   - 💊 **處方建議**：給出一個上述手冊中的參數調整建議。
   - 🔬 **實驗任務**：鼓勵學生動手調整滑桿（如：你能試著把曲柄調小一點嗎？）。
3. **用語**：避免艱澀物理名詞，多用比喻（如曲柄畫圓、直桿拉扯）。禁止出現超出國小程度的專有名詞。✨`;

        // --- 當前背景數據 (Smart Context) ---
        let contextBody = "";

        // 只有在參數變動、有結構衝突、或是歷史紀錄很短時，才發送完整物理數據
        if (currentParamsJson !== this.lastSentParamsJson || analytics.symptom.isClashing || this.history.length < 3) {
            contextBody = `【病患症狀與數據 (有變動)】
- 診斷標籤: ${analytics.diagnosis_tags.join(", ")}
- 症狀詳情: 卡死=${analytics.symptom.isClashing}, 穩定=${analytics.symptom.isStable}, 前進速度=${analytics.symptom.speed} mm/s, 顛簸程度=${analytics.symptom.hopRange} mm
- 機械參數: 腳長=${currentParams.legLength}, 機器人高度=${currentParams.footLength}, 藍色直桿=${currentParams.blueLink}, 曲柄孔位=${currentParams.crankRadius}, 相位差=${currentParams.phaseDiff}°

【病患(使用者)提問】
${userText}`;
            this.lastSentParamsJson = currentParamsJson;
        } else {
            contextBody = `【機械參數維持不變，持續觀察中】\n${userText}`;
        }

        // 紀錄本次通訊到歷史卡片 (偵錯用)
        const historyToSend = this.history.slice(0, -1);
        const historyText = historyToSend.map(h => `[${h.role.toUpperCase()}]: ${h.parts[0].text}`).join('\n');

        this.debugHistory.push({
            timestamp: Date.now(),
            content: `[SYSTEM PROMPT]\n${systemPrompt}\n\n[HISTORY]\n${historyText || '(無歷史紀錄)'}\n\n[CURRENT CONTEXT]\n${contextBody}${imageData ? `\n\n[IMAGE SENT]\n<img src="${imageData}" style="width:100%; border-radius:8px; margin-top:10px; border:1px solid #444;">` : ''}`
        });
        this.currentLogIndex = this.debugHistory.length - 1;
        this.renderDebugCard();

        try {
            const response = await this.callGeminiAPI(systemPrompt, contextBody, historyToSend, imageData);
            this.addMessage('ai', response);
        } catch (error) {
            console.error("[ChatManager] API Error:", error);
            this.addMessage('ai', "哎呀！我的大腦齒輪卡住了，請再試一次！✨");
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