# AI 聊天室整合計畫：COSTAR 框架與連續攝影 (最終修訂版：包含快取策略與例外防護)

本計畫旨在將 `AI_Chatbot_Framework_COSTAR_EN.md` 教學框架與連續攝影（Chronophotograph）的視覺及既有量化數據整合至 AI 聊天室中。為確保 AI 能夠嚴格遵循指令且不受長對話干擾，並同時兼顧效能與成本，實作時將遵守以下邏輯與限制。

## 1. 動態系統提示詞 (System Prompt) 結構與防遺忘機制
**實作重點與必須牢記的規則：**
- **System Prompt 的具體結構 (Prompt Template)**：為了完美配合 Context Caching，我們必須強制將靜態規則與動態數據分離。傳給 AI 的整體 Payload 結構將如下所示：

```xml
<!-- ========================================== -->
<!-- [STATIC CACHED PREFIX: 放最前面以套用快取] -->
<!-- ========================================== -->
<Role_And_Rules>
  (擷取自 COSTAR 框架的核心規則：字數限制、單一粗體重點、禁止直接給答案)
</Role_And_Rules>

<Domain_Knowledge>
  (擷取自 COSTAR 框架的知識庫：摩擦力、重心、連桿原理與對應的解法)
</Domain_Knowledge>

<!-- ========================================== -->
<!-- [DYNAMIC CONTEXT: 每次 API 呼叫都會變動] -->
<!-- ========================================== -->
<Conversation_History>
  (只保留最近的 4-6 句對話紀錄)
</Conversation_History>

<Robot_State>
  <Diagnosis_Tags>卡死、重心不穩</Diagnosis_Tags>
  <Analytics_Data>速度: 0 mm/s, 顛簸程度: 0 mm</Analytics_Data>
  [附件圖片：連續攝影 (Chronophotograph) - 若有觸發則附上]
</Robot_State>

<Student_Input>
  (學生本次輸入的文字)
</Student_Input>

<!-- 最重要的防呆結尾指令 -->
<Tail_Instruction>
  系統強制提醒：請務必遵守 COSTAR 規則！主文限 50 字內，只能挑選「單一」最致命問題進行蘇格拉底式引導。回覆最後必須提供恰好 3 個「建議回覆選項按鈕」。
</Tail_Instruction>
```

- **防止長篇對話失憶 (Lost-in-the-Middle)**：正如上述結構最後一塊 `<Tail_Instruction>` 所示，我們必須在每一次傳遞的 Payload 尾端，加上強制結尾指令。確保 AI 生成前看到的最後一句話是規則提醒。

## 2. Context Caching (提示詞快取) 深度整合與成本估算
**實作重點與必須牢記的規則：**
- **快取結構強制性 (Caching Structure Requirement)**：多數 LLM 供應商（如 Gemini, Anthropic）的 Context Caching 只對「連續的 Prompt 前綴 (Contiguous Prefix)」有效。這代表我們**必須將所有靜態且不變的內容（包含 COSTAR 規則、學科知識庫、機器人基礎規格）全部集中在 Prompt 的最頂端**。一旦中間插入了動態變數（如目前的對話或物理參數），後續的所有內容都無法被快取。
- **動態變數後置**：`chat.js` 在組裝 Prompt 時，絕對不能將動態的 `<Dynamic_Context>` 與圖片放在開頭，必須永遠放在最尾端，緊接在 `<Conversation_History>` 之前。
- **成本節省估算 (Cost Decrease Estimation)**：
  - **傳統模式**：完整的 COSTAR 框架與除錯手冊大約佔用 1,500 - 2,000 Tokens。如果一個學生進行了 10 輪對話，系統每一輪都要重新讀取這些靜態規則，單次互動的輸入 Token 會隨著對話不斷疊加（例如 2000, 2500, 3000...），總輸入輕易突破 25,000 Tokens。
  - **Context Caching 模式**：靜態的 2,000 Tokens 會在第一輪被送入並快取（通常快取寫入費用略高或持平）。但在第 2 輪到第 10 輪中，這 2,000 Tokens 屬於 **Cached Input**，其定價通常比標準 Input 便宜 **50% 到 90%**（依據 API 供應商如 Gemini 或 Claude 而定）。
  - **綜合預估**：在一次常規的 10 輪教學對話中，導入 Context Caching 搭配對話歷史修剪，預計可將 **Input Token 的總成本降低 60% ~ 75%**，同時降低 Time to First Token (TTFT) 帶來的延遲感，讓學生的互動更即時。

## 3. 多模態連續攝影 (Chronophotograph) 處理
**實作重點與必須牢記的規則：**
- **自動影子生成 (Ghost run)**：當學生在「暫停」狀態下發問時，系統會在背景透過迴圈跑完一個週期的數學運算，直接畫出連續攝影並截圖，完全不需要學生點擊播放。
- **視覺引導詞注入**：當有夾帶連續攝影圖片時，必須在送給 AI 的訊息中塞入引導提示：「請觀察附件中的連續攝影 (Chronophotograph) ，依據腳印的分布與機身的高低起伏...」。

## 4. 既有量化數據之應用 (Analytics Data)
**實作重點與必須牢記的規則：**
- **善用既有分析數據**：使用 `getSimplifiedAnalytics()` 算好的數據（例如 `symptom.speed`、`symptom.hopRange`、`isStable`），不需要重新從軌跡座標去算。
- **結構化傳送**：將這些現成的數據直接對應寫入 `<Robot_State>` 中，讓 AI 看到 hopRange 過高就能準確判斷顛簸，減少對圖片的幻覺猜測。

## 5. 結構化回覆解析與 UI 渲染 (Structured Reply & UI Buttons)
**實作重點與必須牢記的規則：**
- **強制限量按鈕**：解析 AI 回覆末端那 3 個建議回覆（兩個推理選項 + 一個求救選項）。
- **解析與隔離**：前端抓取特定符號（例如 `💬`），將主文與選項徹底分離。
- **動態按鈕生成**：分離出的 3 個選項必須渲染成可點擊的 HTML 實體按鈕。

## 6. 對話狀態與自適應降級 (Adaptive Scaffolding & AI Judgment)
**實作重點與必須牢記的規則：**
- **交由 AI 判斷 PDAR/PDIR 階段**：讓 AI 根據對話歷史自行推斷學生的認知進度。
- **挫折偵測機制**：紀錄學生連續回答「不知道」的次數。超過閾值時，在提示中加上：「學生似乎卡住了，請將提問難度降級（改用 A/B 選擇題或具體行動指示）」。

## 7. Token 消耗與防混淆機制 (Cost & Preventing AI Overload)
**實作重點與必須牢記的規則：**
- **影像傳送節流 (Image Throttling)**：只有在「物理參數改變」、「診斷標籤改變」或「學生主動提到視覺關鍵字」時，才傳送圖片。其他時候帶 `null` 以節省 Token。
- **單一焦點強制指令**：強迫 AI 只能挑出「單一個最致命的錯誤」來引導，絕對不要一次給出多個方向，以防止 AI 產生混亂或幻覺。

## 8. 例外處理、Fallback 機制與 UX (Error Handling & Fallbacks)
**實作重點與必須牢記的規則：**
- **防禦性解析 (Defensive Parsing)**：雖然強制要求了 3 個選項，但 AI 偶爾仍會產生格式錯誤（例如少給選項或沒用 `💬` 符號）。解析器必須具備容錯能力，若偵測不到選項，必須提供預設的 Fallback 按鈕（例如：「💬 我不太懂，請再解釋一次」），避免學生在 UI 上卡死。
- **輸入驗證與防溢位 (Input Sanitization)**：防止學生貼上超長文字（如幾萬字的故事）撐爆 Context Window，前端送出前必須截斷超過 100 字的使用者輸入。
- **安全隔離網觸發狀態 (Safety Guardrail UX)**：COSTAR 框架要求遇到危險提問（如剪電池）必須拒答。如果 AI 回傳拒絕且無建議按鈕，系統需保證介面仍有「💬 回到機器人實驗」等安全逃脫按鈕。
- **等待體驗 (Loading UX)**：由於影子生成連續攝影 + 多模態 API 傳輸可能耗時 2~5 秒，必須在送出時顯示明確的「醫生看診中...」或「分析連續攝影中...」等打字動畫 (Typing indicator)，降低小學生的等待焦慮。
