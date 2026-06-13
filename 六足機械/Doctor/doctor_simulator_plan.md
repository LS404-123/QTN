# 六足機械 Doctor Simulator 系統規劃 (第一性原理版)

## 1. 系統目標 (Goal)
本模擬器的主要目的是基於**第一性原理 (First Principles)**，引導學生從「物理能量與控制鏈」的根本出發，逐步排查與修復六足機器人無法正常移動的問題，建立系統性的工程除錯思維。

## 2. 第一性原理除錯邏輯 (First Principles Debugging Logic)
六足機器人的移動本質上是**電能轉化為機械能，並透過地面摩擦力轉化為物理位移**的過程。其能量與控制傳導鏈如下：

$$\text{電能 (電池)} \rightarrow \text{控制訊號 (主機板)} \rightarrow \text{電磁轉換 (馬達)} \rightarrow \text{主傳動 (機米螺絲)} \rightarrow \text{減速傳動 (齒輪箱)} \rightarrow \text{連桿機構 (螺絲鬆緊/曲柄)} \rightarrow \text{步態協調 (接線/相位)} \rightarrow \text{地面交互 (摩擦力)}$$

任何移動故障，皆可定位於此傳導鏈的某一斷點。

---

## 3. 步驟引導流程 (Step-by-Step Guided Workflow)

系統將引導學生按照以下六個物理步驟，由淺入深、由核心向外圍進行排查：

### 步驟 1：確認能量源與大腦 (Power & Control)
*   **物理原理**：無輸入能量或無控制訊號，系統無法作動。
*   **檢查步驟**：
    1.  **電源檢查**：開啟開關，確認主機板指示燈是否亮起？
        *   *否* ➡️ 排查 [電池沒電](file:///c:/Users/LS404/Desktop/QTN/六足機械/Doctor/doctor_simulator_plan.md#L61) 或電源開關接線。
    2.  **訊號檢查**：主機板是否能正常接收指令（如藍牙連接燈號、序列埠輸出）？
        *   *否* ➡️ 排查 [控制器問題](file:///c:/Users/LS404/Desktop/QTN/六足機械/Doctor/doctor_simulator_plan.md#L63)。

### 步驟 2：確認關節自由度 - 離線測試 (Passive Mechanism & Joint Freedom)
*   **物理原理**：在不通電情況下，機構必須具備設計的自由度，不可有過大的摩擦力或卡死。
*   **檢查步驟**：
    1.  **手動旋轉**：關閉電源，用手輕輕轉動各個關節與曲柄，是否能順暢旋轉？
        *   *否（卡死/極度吃力）* ➡️ 排查 [螺絲太緊](file:///c:/Users/LS404/Desktop/QTN/六足機械/Doctor/doctor_simulator_plan.md#L58)。
        *   *是（但晃動劇烈、鬆垮）* ➡️ 排查 [螺絲太鬆](file:///c:/Users/LS404/Desktop/QTN/六足機械/Doctor/doctor_simulator_plan.md#L59) 或結構變形。

### 步驟 3：確認動力傳遞 (Power Transmission)
*   **物理原理**：馬達產生的旋轉轉矩必須有效傳遞至曲柄，且減速機構運作正常。
*   **檢查步驟**：
    1.  **馬達空轉檢查**：通電並給予移動指令。馬達是否有發出運轉聲音？
        *   *否（完全無聲）* ➡️ 排查 [馬達燒毀](file:///c:/Users/LS404/Desktop/QTN/六足機械/Doctor/doctor_simulator_plan.md#L66) 或 [電線鬆脫](file:///c:/Users/LS404/Desktop/QTN/六足機械/Doctor/doctor_simulator_plan.md#L67)。
    2.  **軸心耦合檢查**：若有馬達運轉聲，但曲柄與大腿完全沒有旋轉？
        *   *是* ➡️ 排查 [機米螺絲](file:///c:/Users/LS404/Desktop/QTN/六足機械/Doctor/doctor_simulator_plan.md#L55)（未對準馬達 D 軸或未鎖緊）。
    3.  **減速箱檢查**：是否有聽到「喀喀喀」或尖銳的齒輪摩擦異音？
        *   *是* ➡️ 排查 [齒輪箱問題](file:///c:/Users/LS404/Desktop/QTN/六足機械/Doctor/doctor_simulator_plan.md#L69)（掃齒或崩齒）。

### 步驟 4：確認機構幾何 (Mechanism Geometry)
*   **物理原理**：連桿機構的長度與相對組裝位置決定了步態的幾何軌跡，若幾何不對稱將導致內部力矩抵消或卡死。
*   **檢查步驟**：
    1.  **尺寸對稱檢查**：對照設計圖，使用虛擬量測工具測量所有腳的曲柄與連桿長度是否一致？
        *   *否* ➡️ 排查 [曲柄長度設定錯誤](file:///c:/Users/LS404/Desktop/QTN/六足機械/Doctor/doctor_simulator_plan.md#L71)。
    2.  **方向對稱檢查**：對比 3D 模型，檢查左右兩側的腿部零件是否裝反、裝錯孔位？
        *   *是* ➡️ 排查 [組裝錯誤](file:///c:/Users/LS404/Desktop/QTN/六足機械/Doctor/doctor_simulator_plan.md#L73)。

### 步驟 5：確認控制方向與步態協調 (Control Signal Direction & Coordination)
*   **物理原理**：多個執行器（馬達）必須在正確的時間（相位）向正確的方向旋轉，才能產生合力。
*   **檢查步驟**：
    1.  **旋轉方向檢查**：給予前進指令，觀察左右馬達是否同時向前旋轉？（如一邊前進一邊後退導致原地打轉）
        *   *否* ➡️ 排查 [腳位與接線插錯](file:///c:/Users/LS404/Desktop/QTN/六足機械/Doctor/doctor_simulator_plan.md#L75)（正負極反接）。
    2.  **步態相位檢查**：機器人是否六隻腳同時落地，或相位錯亂導致身體上下劇烈晃動卻無法前進？
        *   *是* ➡️ 排查 [步態相位角錯位](file:///c:/Users/LS404/Desktop/QTN/六足機械/Doctor/doctor_simulator_plan.md#L77)。

### 步驟 6：確認地面交互作用 (Ground Interaction)
*   **物理原理**：機器人前進的動力來自於腳底與地面的靜摩擦力，摩擦力不足會導致打滑。
*   **檢查步驟**：
    1.  **摩擦力檢查**：機器人所有機構在空中運作完美，但一落地就原地踏步或打滑？
        *   *是* ➡️ 排查 [腳步摩擦力不足](file:///c:/Users/LS404/Desktop/QTN/六足機械/Doctor/doctor_simulator_plan.md#L79)（未貼防滑墊）。

---

## 4. 常見故障定義 (Trouble Definition & Anchors)

### 🚨 高機率常見問題 (High Probability Issues)
1. **機米螺絲未固定 (Grub Screw)**
   - **現象**：馬達在轉，但腳完全不動。
   - **檢修**：檢查機米螺絲是否鎖在馬達 D 字軸的平面上。
2. **螺絲鬆緊度不當 (Screw Tightness)**
   - **現象**：手動轉動腳部非常卡（太緊）或整隻腳晃動劇烈（太鬆）。
   - **檢修**：太緊則放鬆半圈，太鬆則鎖緊至剛好有阻力但能順暢轉動。

### 🔍 其他潛在問題 (Other Potential Issues)
3. **電池沒電 (Battery Dead)**
   - **現象**：完全不動，或通電後動作極度無力。
4. **控制器問題 (Controller Issue)**
   - **現象**：無法連線，主機板指示燈不亮或異常閃爍。
5. **馬達異常 (Motor Issues)**
   - **現象**：下達指令後馬達完全無聲、無震動（燒毀或斷線）。
6. **齒輪箱問題 (Gearbox)**
   - **現象**：發出「喀喀喀」異音，輸出軸抖動。
7. **曲柄長度設定 (Crank Length)**
   - **現象**：兩側步伐不對稱，某一隻腳跨步特別小或卡到身體。
8. **組裝錯誤 (Assembly Error)**
   - **現象**：左右腿部連桿組裝不對稱，無法完成標準三角步態。
9. **腳位與接線插錯 (Wiring / Pinout Error)**
   - **現象**：前進指令變成倒退或原地打轉。
10. **步態相位角錯位 (Phase Angle Misalignment)**
    - **現象**：六隻腳動作各走各的，像在原地跳躍或一直摔倒。
11. **腳步摩擦力不足 (Insufficient Foot Friction)**
    - **現象**：腳步動作流暢，但在光滑桌面踏步前進困難。
