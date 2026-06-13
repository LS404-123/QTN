---
name: code-feature-summarizer
description: This skill should be used when reviewing code in a folder and summarizing each feature into a separate markdown document, connecting them through a central index.md file to explain how they function collectively.
---

# 程式碼功能特徵整理指南 (Code Feature Summarizer)

本技能用於將指定資料夾中的源碼檔案進行深度審查，並按「功能特徵 (Features)」將其整理為結構化的繁體中文 md 說明文檔，最後建立一個 `index.md` 串聯所有功能，說明整個系統如何協同運作。

## 適用場景
- 當使用者要求對某個代碼資料夾進行 review。
- 當需要將以檔案區分的代碼，改以「功能特徵」為維度整理為多份繁體中文說明文件，且不需要在文檔中包含符號連結。
- 當需要建立一個 `index.md` 以說明系統的 Main Loop、生命週期或架構運作。

## 執行流程

### 1. 深入探索代碼 (Research)
- 遍歷並閱讀目標資料夾下的所有原始程式碼。
- 梳理出系統運行的核心功能清單（例如幾何约束、物理推進、碰撞檢測、相機動力學、背景滾動等），而非單純以檔案名稱作為文檔劃分依據。

### 2. 規劃說明文件清單
- 擬定擬產生的 md 說明文件列表。除了引導用的 `index.md` 外，每個核心功能特徵都應有專屬的 md 文件。
- 在 Planning Mode 下，將文件清單及大綱寫入實作計畫供使用者核准。

### 3. 撰寫主導引文件 (index.md)
- 串聯所有功能特徵，說明系統的協同運作機制與主循環 (Main Loop)。
- 可以繪製 Mermaid 流程圖來視覺化運行生命週期。
- 提供所有功能文檔的引導目錄。

### 4. 撰寫功能特徵文檔
- 為清單中的各功能分別建立 `.md` 檔案，存放在使用者指定的文檔目錄中。
- 寫作風格規範：
  - **繁體中文**：全文件必須使用繁體中文撰寫。
  - **口語精簡 (Terse)**：用 casual 的口吻、不說廢話，直接切入核心幾何演算法、物理公式或關鍵控制邏輯。
  - **專業導向**：將閱讀者視為專家，不解釋基礎 JS/Python 語法，著重於實現細節與數學/物理推導。
  - **無符號連結**：文件內容中不需要加入 `file://` 等符號連結，保持文檔文字的乾淨與獨立性。

## 功能特徵文件撰寫要點參考 (以機械模擬為例)

- **kinematics_geometry.md**：詳細說明連桿幾何、圓-圓交點求法，以及橢圓足尖 Support Function 切點計算與實體偏置補償。
- **static_stability.md**：解說凸包下邊緣切線搜尋算法、重心投影支撐區間 (Support Polygon) 判定與單雙點平衡退化。
- **propulsion_dynamics.md**：解說姿態恢復剛度與重力矩、累積滑動推力積分、法向力分配與 Explicit Euler 數值穩定性截斷。
- **collision.md**：解說大腿（線段）與腳掌（膠囊體）建模、線段距離計算與碰撞點求取。
- **chronophotography.md**：解說時序連續攝影定角擷取 Hook、像素 Alpha 邊界裁切與對齊地平線的網格拼接。
- **rendering.md**：解說座標映射、向量圖形 Path2D 變換、離屏雙側景深渲染與儀表板疊加。
- **camera_dynamics.md**：解說低通 EMA 濾波、跟隨滯後與臨界阻尼追隨系統。
- **parallax_background.md**：解說景深視差更新、Image 轉換與雙重取模無縫平鋪。
- **ui_interaction.md**：解說滑桿雙向同步、參數變更防抖重置（Grounded 清除）與動態單幀驅動機制。
