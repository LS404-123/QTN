---
name: 機械人 SVG 生成器
description: 用於為機械人模擬生成和優化 SVG 組件的技能，確保正確的比例、關節和分層。
---

# 機械人 SVG 生成器

此技能為 `robot_simulation-` 專案提供創建 SVG 資產的專門指令。

## SVG 設計原則

1.  **純 SVG 輸出**：除非明確要求 HTML 封裝，否則應僅提供 `<svg>` 標籤及其內容，移除所有 HTML/CSS 模板。
2.  **座標與比例**：儘可能使用 1:1 的座標系統（例如：1 單位 = 1mm），並將關鍵尺寸標註於註解中。
3.  **樣式控制**：使用內嵌屬性 (Inline Attributes，如 `fill="..."`, `stroke="..."`) 而非外部 CSS 類別，以確保在不同環境,尤其html下的可移植性。
4.  **技術精準度**：嚴格遵守藍圖尺寸，避免使用佔位符。對於零件，預設使用極細線條 (`stroke-width: 0.2-0.5`)。
5.  **分層與命名**：根據機械組件（例如：股節、脛節、轉節）對元素進行分群 (`<g>`) 並加上描述性註解。
6. **詢問使用者**：如果任何尺寸不清楚，請先詢問使用者，不要隨意猜測。

## 常見組件

### 基礎腿部連桿
具有兩個孔位和圓角主體的標準連桿。
```svg
<svg viewBox="0 0 200 60">
  <path d="M 30,10 L 170,10 A 20,20 0 0 1 170,50 L 30,50 A 20,20 0 0 1 30,10 Z" fill="#444" />
  <circle cx="30" cy="30" r="10" fill="#fff" />
  <circle cx="170" cy="30" r="10" fill="#fff" />
</svg>
```

### 進階足部連桿 (藍圖風格)
具有漸變擴張 (Flare) 與飽滿弧形 (Large Arc) 的精密組件範例：
```svg
<svg viewBox="0 0 60 115" xmlns="http://www.w3.org/2000/svg">
    <!-- 
        Blueprint Dimensions:
        18mm Neck | 45mm Hole Spacing | 50mm Base Width | 15.37mm Foot Height (ry=13)
    -->
    <path d="
        M 21, 20
        A 9,9 0 0, 1 39, 20
        L 39, 72.6
        Q 39, 88, 54.58, 88
        A 25, 13 0 1, 1 5.42, 88
        Q 21, 88, 21, 72.6
        Z" 
        fill="none" 
        stroke="#ff9800" 
        stroke-width="0.2" 
        stroke-linejoin="round" />
    
    <!-- Mounting Holes (D=3mm) -->
    <circle cx="30" cy="20" r="1.5" fill="none" stroke="#ff9800" stroke-width="0.2" />
    <circle cx="30" cy="65" r="1.5" fill="none" stroke="#ff9800" stroke-width="0.2" />
</svg>
```

## 優化流程
1.  **尺寸定義**：定義關鍵孔距與整體長寬（例如：45mm 孔距）。
2.  **草圖**：使用 `L` 定義直線，`Q` 或 `C` 定義平滑的擴張過渡。
3.  **飽滿弧形**：若需大於 180 度的弧形，使用 `A` 指令並將 `large-arc-flag` 設為 1。
4.  **細節處理**：調整線條寬度至 0.2-0.5 以符合藍圖美學。
