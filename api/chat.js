/**
 * Vercel Serverless Function: Gemini Proxy
 * 負責安全地將請求轉發給 Google Gemini API
 */

export default async function handler(req, res) {
  // 只允許 POST 請求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { systemPrompt, userText, history, imageData } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  // 使用系統指令與內容歷史
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;

  const contents = history ? [...history] : [];
  
  // 構建當前訊息的 parts
  const currentParts = [{ text: userText }];
  
  // 如果有圖片，加入 inline_data
  if (imageData) {
    // 移除 Base64 前綴 (如果有的話)
    const base64Data = imageData.includes('base64,') 
      ? imageData.split('base64,')[1] 
      : imageData;
      
    currentParts.push({
      inline_data: {
        mime_type: "image/webp",
        data: base64Data
      }
    });
  }

  contents.push({ role: 'user', parts: currentParts });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 200,
        },
      }),
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
    res.status(200).json(data);
  } catch (error) {
    console.error('[API Error]:', error);
    res.status(500).json({ error: 'Failed to fetch from Gemini API' });
  }
}
