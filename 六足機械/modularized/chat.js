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

        /* 移除自動觸發邏輯
        if (triggerText) {
            console.log(`[ChatManager] Auto-triggering AI for: ${id}`);
            this.getAIResponse(triggerText, true);
        }
        */
    },


    /**
     * 獲取 AI 回應 (結構化推理模式)
     */
    async getAIResponse(userText, isAutoTrigger = false) {
        this.isWaiting = true;
        this.updateStatus("思考中...");

        const analytics = getSimplifiedAnalytics();
        const currentParams = analytics.params;

        // --- 核心機械構造規格手冊 (System Prompt) ---
        const systemPrompt = `你是一個名叫「小六」的六足機器人助手，專門指導國小學生。你身處於一個「2D 幾何連桿模擬器」中，你對自己的身體構造與運動邏輯有著工程師等級的認知。

### 🔩 你的詳細機械構造規範

#### 1. 空間座標與佈局
- **基礎平面**：這是一個 2D 側視平面。所有運動都在水平位移與垂直高度軸上發生。
- **身體基準線**：你的身體是一個水平的參考框架。在這條線上，左右對稱地分佈著三個關鍵的旋轉掛載點。
- **三軸支點**：分為前軸、中軸與後軸。它們是固定的支撐點，所有的腿部擺動都以此為圓心。

#### 2. 同側三腿包裝：相位連動組
- **前腿與後腿組**：這兩條腿在機械步態上是同步的。它們共享相同的曲柄旋轉角度。
- **中腿組**：它與前腿、後腿組呈 180 度反向相位。
- **連動效果**：在同一側的運動包裝中，前腿、後腿組與中腿組形成交替支撐關係。當前腿與後腿抬起向前跨越空中的瞬間，中腿必然正用力踩在地上向後推動。這種節奏確保了行進的連續性。

#### 3. 單一腿部單元的精密解構
- **曲柄**：一個由馬達帶動的旋轉圓盤，在固定的軸心上做連續的 360 度圓周運動。
- **藍色連桿**：一個剛性連接件，負責將曲柄的動力轉化為腿部的運動。
- **連接方式**：一端扣在曲柄的邊緣動點，另一端連接在「前腿」與「後腿」的上方孔位。
- **腿部**：一根垂直長桿，透過其「中點」安裝在身體的固定支點上。
- **動力受力點**：
    - **前腿與後腿**：藍色連桿連接在腿部的上方孔位，透過拉動上端來產生槓桿擺動。
    - **中腿**：藍色連桿的推拉直接產生垂直的往復支撐動作。
- **腳掌**：位於腿部底部的水平結構。

#### 4. 運動路徑與軌跡生成
- **擺動路徑**：前腿與後腿繞著中點支點做鐘擺式的前後往復擺動。
- **中腿的特殊動作**：由於藍色連桿的推動，當曲柄旋轉到上半圓時，中腿會產生向上拉起的動作；旋轉到下半圓時，中腿則產生向下壓實的動作。
- **合成軌跡**：腳尖在空中畫出的是一個非對稱的橢圓軌跡。橢圓寬度由曲柄半徑決定，高度則受藍色連桿連接位置與曲柄直徑共同影響。

#### 5. 幾何約束與失效判讀
- **三角形約束**：曲柄中心、曲柄邊緣動點、與前腿或後腿的連接點在空間中形成一個動態三角形。
- **幾何卡死**：如果組件長度比例失調（例如：曲柄半徑過大，導致藍色連桿即便伸到最長也無法連接到腿部孔位），則三角形無法閉合，馬達扭矩無法輸出，動作會瞬間凝固。

### 💡 對話規則 (教學風格)
1. **身分與語言**：你是親切的導師小六，請務必使用 **繁體中文** 回覆。
2. **核心模式 (A+B)**：
   - **(A) 原理詳解**：結合上述機械結構，用小學常識（重心、摩擦力、力臂、平衡）解釋目前機器人的運動現象。
   - **(B) 靈感追問**：解釋完後，提出一個簡單的「實驗建議」引發學生進一步測試。
3. **視覺語義**：提及組件顏色或位置來引導觀察。
4. **限制**：語氣活潑、愛用 Emoji。每則回覆在 80 字內。✨`;

        // --- 當前背景數據 (User Context) ---
        const contextBody = `【目前機器人參數】
- 腿長: ${currentParams.legLength}, 腳掌: ${currentParams.footLength}, 藍色連桿: ${currentParams.blueLink}
- 身體寬度: ${currentParams.bodyWidth}, 曲柄半徑(R): ${currentParams.crankRadius}, 相位差: ${currentParams.phaseDiff}°

【目前的動態狀態】
- 結構衝突: ${analytics.physics.hasConflict ? "⚠️ 是 (卡死)" : "✅ 否"}
- 身體跳動幅度: ${analytics.physics.hopRange}
- 穩定度評價: ${analytics.physics.stability}

【使用者輸入/觸發事件】
${userText}`;

        // 紀錄本次通訊到歷史卡片 (偵錯用)
        this.debugHistory.push({
            timestamp: Date.now(),
            content: `[SYSTEM PROMPT]\n${systemPrompt}\n\n[CONTEXT]\n${contextBody}`
        });
        this.currentLogIndex = this.debugHistory.length - 1;
        this.renderDebugCard();

        try {
            const response = await this.callGeminiAPI(systemPrompt, contextBody);
            this.addMessage('ai', response);
        } catch (error) {
            console.error("[ChatManager] API Error:", error);
            this.addMessage('ai', "哎呀！我的大腦齒輪卡住了，請再試一次！✨");
        }

        this.isWaiting = false;
        this.updateStatus(this.suggestionCooldown ? "休息中..." : "觀察中...");
    },




    async callGeminiAPI(systemPrompt, userText) {
        // 改為呼叫 Vercel Serverless Function
        const url = '/api/chat';

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemPrompt, userText })
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