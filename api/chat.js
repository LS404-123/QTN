/**
 * Vercel Serverless Function: Gemini Proxy
 * 負責安全地將請求轉發給 Google Gemini API，並支援 Context Caching
 */

let globalCachedName = null;
let globalCacheExpiry = 0;

export default async function handler(req, res) {
  // 只允許 POST 請求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { systemPrompt, userText, history, imageData, images } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  // === 1. 嘗試使用 Context Caching 處理 System Prompt ===
  let cachedContentName = null;
  const now = Date.now();
  
  if (globalCachedName && now < globalCacheExpiry) {
    cachedContentName = globalCachedName;
  } else {
    try {
      const cacheUrl = `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`;
      const cacheRes = await fetch(cacheUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: "models/gemini-3.1-flash-lite",
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          ttl: "3600s"
        })
      });
      
      if (cacheRes.ok) {
        const cacheData = await cacheRes.json();
        globalCachedName = cacheData.name;
        globalCacheExpiry = now + 3500 * 1000; // 提早 100 秒過期以保證安全
        cachedContentName = globalCachedName;
        console.log("[Cache] Created new context cache:", cachedContentName);
      } else {
        console.warn("[Cache] Failed to create cache, falling back to standard request.", await cacheRes.text());
      }
    } catch (e) {
      console.warn("[Cache] Error creating cache:", e);
    }
  }

  // === 2. 準備生成內容的請求 ===
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;

  const contents = history ? [...history] : [];
  
  // 構建當前訊息的 parts
  const currentParts = [{ text: userText }];
  
  // 處理多張圖片
  const imageList = images || (imageData ? [imageData] : []);
  for (const imgData of imageList) {
    if (!imgData) continue;
    // 移除 Base64 前綴 (如果有的話)
    const base64Data = imgData.includes('base64,') 
      ? imgData.split('base64,')[1] 
      : imgData;
      
    currentParts.push({
      inline_data: {
        mime_type: "image/webp",
        data: base64Data
      }
    });
  }

  contents.push({ role: 'user', parts: currentParts });

  // 根據是否有 Cache 決定 Request Body
  let requestBody = {
    contents: contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 200,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          mainText: {
            type: "STRING",
            description: "AI 的正文回覆（不超過 80 字，只能用簡單句，不能包含幾何/死點/干涉等禁用詞）"
          },
          suggestedReplies: {
            type: "ARRAY",
            items: {
              type: "STRING"
            },
            description: "精確的 3 個建議回覆按鈕文字（例如 '💬 縮短腿長試試看？'）"
          }
        },
        required: ["mainText", "suggestedReplies"]
      }
    },
  };

  if (cachedContentName) {
    requestBody.cachedContent = cachedContentName;
  } else {
    requestBody.system_instruction = {
      parts: [{ text: systemPrompt }]
    };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[Gemini API Error]:', JSON.stringify(errorData, null, 2));
      return res.status(response.status).json({ 
        error: 'Gemini API error', 
        details: errorData,
        status: response.status 
      });
    }

    const data = await response.json();
    data._cacheStatus = cachedContentName ? `Hit: ${cachedContentName}` : 'Miss (Fallback to system_instruction)';
    res.status(200).json(data);
  } catch (error) {
    console.error('[API Error]:', error);
    res.status(500).json({ error: 'Failed to fetch from Gemini API' });
  }
}
