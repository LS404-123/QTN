# 六足機器人模擬器：物理與程式運作核心細節完全解析
(Hexapod Simulator: Full In-Depth Physics and Execution Flow)

本文件詳細且深度剖析 `simulation.js` 中的運作演算法與物理機制，列出程式碼中的變數、公式以及其對應到真實世界現象的嚴謹解釋。

---

## 1. 模擬器每幀運作流程與演算法細節 (Algorithmic Execution Flow)

模擬器在每一幀（Frame）的執行主要分為以下幾個步驟（對應程式碼中的 `renderFrame` 迴圈）：

### 1.1 純幾何運動學計算 (Kinematic Geometry Update)
- **概念**：模擬器不使用動力學約束求解器，而是基於仿生機構（如仿 Strandbeest 的 Klann/Jansen Linkage，或自定義的曲柄連桿機構）進行顯式幾何展開。
- **演算法細節 (`getLegPositions`)**：
  - 根據當前的主軸角度 `currentTheta`，計算曲柄的座標 $(x_c, y_c)$。
  - 使用兩圓交點函數 `getIntersection(C1, r1, C2, r2)`，依照連桿的恆定長度（剛體假設），依序求出關節 A、B、C 點的座標。
  - 最終推導出足端（Foot Point）的局部座標 $(x, y)$。這會同時對兩側（近側與遠側，有 180 度 `phaseDiff` 相位差）的六隻腳進行計算。
  - 此時的計算**完全不考慮重力或地面**，僅依賴馬達強行驅動曲柄的剛性幾何特性。

### 1.2 尋找地面支撐點與姿態目標 (Ground Contact & Convex Hull)
- **概念**：由於機身是自由落體狀態，真正的地面高度相對機身是不斷變化的。
- **演算法細節**：
  - 將這六隻腳的底端視為二維平面上的點集合，尋找其下邊緣的「凸包（Convex Hull）切線」。
  - 程式會嘗試連接任意兩隻腳，計算這條連線的斜率。若這條線能將所有其餘的腳都包容在它的上方，且機身重心（X=0）落在這兩隻腳之間，則這條線就是最穩定的物理支撐面（真實世界中的地面）。
  - 由這條線的幾何斜率，反推出機器人「應該要有的理想目標傾角」（`targetRoll`）。

### 1.3 姿態動力學更新 (Posture Dynamics & Torsional Damping)
- **概念**：機身並不會瞬間貼平目標傾角，這會違反物理。機體會依賴內部結構柔性與重力產生平滑的旋轉。
- **演算法細節**：
  - 計算角度誤差：`rollErr = targetRoll - bodyRoll`
  - 使用一個旋轉彈簧阻尼模型來更新角速度：
    `bodyRollVel += (rollErr * rollStiffness + torque - bodyRollVel * DampingFactor) * dt`
  - 使用顯式尤拉法（Explicit Euler Integration）更新實際傾角：
    `bodyRoll += bodyRollVel * dt`
  - 這樣能確保步伐切換時，重心轉移會帶有慣性與搖晃感，而非生硬的瞬間跳變。

### 1.4 觸地判定與正向力分配 (Ground Detection & Normal Force)
- **概念**：當機身傾角確定後，系統會將機身垂直下移，直到足端碰到地面 $y = y_{ground}$。
- **演算法細節 (`computeNormalForces`)**：
  - 在極小容差 `CONTACT_TOL` (0.2) 範圍內的腳會被標記為觸地。
  - **力矩平衡計算**：觸地腳在地面上的投影座標 $d = x \cos(R) - y \sin(R)$。
  - 將最左側與最右側的腳視為支點，依照重心 ($d=0$) 到支點的距離比例，利用槓桿原理分配重力：
    - $w_L = \frac{d_R}{d_R - d_L}$ （重心越靠近左邊，左邊受力越大）
    - $w_R = \frac{-d_L}{d_R - d_L}$
  - 為了防止打滑失真，程式設定了 `minWeight = 0.15`，確保中間落地的腳依然能分攤到部分正向力（$F_N$），其餘剩餘重量再依力矩比例分配。

### 1.5 彈性足端與摩擦力計算 (Elastic Foot & Friction Physics)
- **概念**：客製化的「彈性摩擦力模型（Penalty-based Friction Model）」。
- **演算法細節**：
  - 對於觸地腳，計算相對於地面的「打滑位移（`slipDistance`）」：當腳試圖穿透或在地面滑動時，會被虛擬彈簧拉住。
  - 計算瞬時滑動速度：`slip_vel = dx_slip / dt`。
  - 計算推力（彈力加阻尼力）：$F_x = (K \cdot slip) + (C \cdot slip\_vel)$。
  - 計算極限靜摩擦力：$F_{max} = \mu \cdot F_N$（使用庫倫乾摩擦定律）。
  - 若 $F_x > F_{max}$，推力被截斷為 $F_{max}$，並將腳強制拉回極限距離，發生真實物理打滑（Skid）。

### 1.6 機身平移積分 (Body Translation Integration)
- **概念**：根據所有腳提供的淨推力，移動機身。
- **演算法細節**：
  - 將所有觸地腳的推力加總：$\Sigma F_x = totalForceX$。
  - 計算加速度：$a = \Sigma F_x / m$。
  - 積分速度與位置：
    `bodyVelX += a * dt`
    `bodyX += bodyVelX * dt`
  - 如果遭遇騰空狀態（無腳觸地），機器人會因為殘留的 `bodyVelX` 繼續向前滑行，完美保留實體動能。

---

## 2. 核心參數與真實世界物理特性的深度對應

### A. 腳掌彈性與變形 (Rubber Foot Elasticity)
* **數學模型**：虎克定律（Hooke's Law） $F = -K \Delta x$
* **核心參數**：`footStiffness` (30 N/mm), `slipDistance`
* **深度說明**： 
  在微觀物理中，沒有絕對剛性的接觸。當橡膠腳墊接觸地面並被機器人往後拉時，橡膠會發生「剪切形變（Shear Deformation）」並儲存應變能。`slipDistance` 就是記錄腳趾頭黏在地面上被扯遠的拉伸量。`footStiffness` 是這根隱形彈簧的剛度。這些被拉伸的橡膠分子企圖縮回的張力，就是推動機身前進的推力。

### B. 能量耗散與阻尼 (Energy Dissipation & Damping)
* **數學模型**：黏滯阻尼（Viscous Damping） $F = -C v$
* **核心參數**：`footDamping` (0.4 N/(mm/s)), `slip_vel_real_mm`
* **深度說明**： 
  單純的彈簧系統是無損的（Lossless），會導致機器人踩地時瘋狂高頻震盪。現實中的橡膠與關節材料具有內摩擦（Internal Friction）。阻尼 `footDamping` 與足端的瞬間打滑速度成正比，它會產生反向抵抗力，將震盪的動能轉換為熱能消散，防止數值積分不穩定（Numerical Explosion），使動力輸出極度線性平滑。

### C. 庫倫乾摩擦極限 (Coulomb Dry Friction Limit)
* **數學模型**：$F \le \mu F_N$
* **核心參數**：`frictionCoeff` (0.8), `weights[idx]` (即 $F_N$ 比例), `F_max`
* **深度說明**： 
  依據 Amontons-Coulomb 摩擦力定律，靜摩擦力的極限完全取決於正向下壓力 $F_N$。當某隻腳位於邊緣，分攤到了 80% 的機身重量時，它能承受非常大的彈簧拉力而不打滑；反之，若某隻腳只輕觸地面（分攤 15% 重量），其 $F_{max}$ 極低，稍微被拉扯就會突破極限而在地上摩擦滑行（Skid）。這解釋了為何步伐過大時機器人會原地空轉。

---

## 3. 運動與靜止沉降的物理過渡 (Moving vs. Sitting / Settling)

機器人在「持續行走（Moving）」與「停止後靜止於地面（Sitting / Settling）」之間，系統採用了無縫接軌的物理降解演算法。

### 3.1 停止運動學 (Kinematic Freeze)
當使用者暫停播放 (`isPlaying = false`)，代表切斷馬達電源：
- 主軸角速度 `simSpeed` 的作用被阻斷。
- 所有的幾何連桿姿態被**凍結**在當下的角度（`theta` 停止增加）。這對應真實世界中帶有蝸輪蝸桿減速機（Worm Gear）的馬達，一旦斷電便會自鎖不逆轉。

### 3.2 物理殘餘與阻尼沉降 (Physics Settling Algorithm)
即便幾何學凍結，重力與彈性引擎卻**並未停止**。
關閉電源的機器人，會因為原有的車身傾角慣性與橡膠腳墊的回彈，產生「重心墜落」與「懸吊微震」的過程。
```javascript
const isSettled = !isPlaying && Math.abs(bodyRollVel) < 1e-4 && Math.abs(targetRoll - bodyRoll) < 1e-4;
if (AdminController.isAnimating(isPlaying, isSettled)) {
    requestAnimationFrame(animate);
}
```
只要 `isSettled` 尚未滿足極小容差（角速度與角度誤差皆小於 $10^{-4}$），主迴圈就會繼續推演物理方程式。這使得機器人停下的瞬間，會展現出自然的重力下壓與前後微晃，最終將所有動能被阻尼耗散殆盡後，才穩固地「坐（Sit）」入物理平衡態。

### 3.3 慢動作全域時間縮放 (Slow-Motion Time Dilation)
為保證慢動作下依然符合嚴格的牛頓力學，系統不只縮小了曲柄角度增量，還將傳遞給物理積分引擎的時間步長 `dt` 進行了等比縮放：
```javascript
const factor = isSlowMo ? 0.2 : 1.0;
const simDt = dt * factor; 
renderFrame(theta, isPlaying, simDt);
```
這項核心設計代表：
1. `bodyRoll += bodyRollVel * simDt`
2. `bodyVelX += a * simDt`
不論是落下速度、打滑漸變，還是阻尼搖晃的頻率，在時間尺度上都被完全線性地拉長。就算在慢動作中突然按下「暫停」，機器人向下沉降的重力墜落感也會精準地呈現 $0.2\times$ 速率的高速攝影機視覺效果。
