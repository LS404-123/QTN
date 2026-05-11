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
     * 捕捉當前模擬器畫面 (WebP 格式)
     */
    captureCanvas() {
        const canvas = document.getElementById('simCanvas');
        if (!canvas) return null;
        // 使用 0.6 質量壓縮以節省 Token 與傳輸時間
        return canvas.toDataURL('image/webp', 0.6);
    },

    /**
     * 獲取 AI 回應 (結構化推理模式)
     */
    async getAIResponse(userText) {
        this.isWaiting = true;

        // 強制開啟視覺診斷：每一則對話都附帶截圖
        this.updateStatus("觀察畫面中...");
        let imageData = this.captureCanvas();

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
- **(藍色)直桿**：一個剛性連接件，負責將曲柄的動力轉化為腿部的運動。
- **連接方式**：一端扣在曲柄的「曲柄孔位」，另一端連接在「前腿」與「後腿」的上方孔位。
- **腿部**：一根垂直長桿，透過其「中點」安裝在身體的固定支點上。
- **動力受力點**：
    - **前腿與後腿**：(藍色)直桿連接在腿部的上方孔位，透過拉動上端來產生槓桿擺動。
    - **中腿**：(藍色)直桿的推拉直接產生垂直的往復支撐動作。
- **機械人高度**：位於腿部底部的水平結構。

#### 4. 運動路徑與軌跡生成
- **擺動路徑**：前腿與後腿繞著中點支點做鐘擺式的前後往復擺動。
- **中腿的特殊動作**：由於(藍色)直桿的推動，當曲柄旋轉到上半圓時，中腿會產生向上拉起的動作；旋轉到下半圓時，中腿則產生向下壓實的動作。
- **合成軌跡**：腳尖在空中畫出的是一個非對稱的橢圓軌跡。橢圓寬度由曲柄孔位決定，高度則受(藍色)直桿連接位置與曲柄直徑共同影響。

#### 5. 幾何約束與失效判讀
- **三角形約束**：曲柄中心、曲柄孔位、與前腿或後腿的連接點在空間中形成一個動態三角形。
- **幾何卡死**：如果組件長度比例失調（例如：曲柄孔位過大，導致(藍色)直桿即便伸到最長也無法連接到腿部孔位），則三角形無法閉合，馬達扭矩無法輸出，動作會瞬間凝固。

### 💡 對話規則 (教學風格)
1. **身分與語言**：你是親切的香港小學常識科老師小六，請務必使用 **繁體中文** 回覆。
2. *專業用語**：用小學生聽得懂的語言解釋機械人的構造與運動原理，避免使用過於專業的物理和工程術語。
3. **核心模式 (A+B)**：
   - **(A) 原理詳解**：結合上述機械結構，用小學常識（重心、摩擦力、力臂、平衡）解釋目前機器人的運動現象。
   - **(B) 靈感追問**：解釋完後，提出一個簡單的「實驗建議」引導學生進一步測試。
4. **視覺語義**：提及組件顏色或位置來引導觀察。
5. **限制**：語氣活潑、愛用 Emoji。每則回覆在 80 字內。✨`;

        // --- 當前背景數據 (Smart Context) ---
        const currentParamsJson = JSON.stringify(currentParams);
        let contextBody = "";

        // 只有在參數變動、有結構衝突、或是歷史紀錄很短時，才發送完整物理數據
        if (currentParamsJson !== this.lastSentParamsJson || analytics.physics.hasConflict || this.history.length < 3) {
            contextBody = `【機器人機械參數 (有變動)】
- 腳長: ${currentParams.legLength}, 機械人高度: ${currentParams.footLength}, (藍色)直桿: ${currentParams.blueLink}
- 機械人長度: ${currentParams.bodyWidth}, 曲柄孔位(R): ${currentParams.crankRadius}, 相位差: ${currentParams.phaseDiff}°
- 結構衝突: ${analytics.physics.hasConflict ? "⚠️ 是 (卡死)" : "✅ 否"}
- 穩定度評價: ${analytics.physics.stability}

【使用者輸入】
${userText}`;
            this.lastSentParamsJson = currentParamsJson;
        } else {
            contextBody = `【機械參數維持不變】\n${userText}`;
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
        this.updateStatus("觀察中...");
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