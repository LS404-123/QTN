# 六足機器人模擬器：物理與程式運作流程解析
(Hexapod Simulator: Physics and Execution Flow)

本文件詳細說明了 `simulation.js` 中的運作流程，以及程式碼中的各個變數是如何對應到真實世界中的物理現象。

## 1. 模擬器每幀運作流程 (Frame-by-Frame Execution Flow)

模擬器在每一幀（Frame）的執行主要分為以下幾個步驟（對應程式碼中的 `renderFrame` 迴圈）：

1. **純幾何運動學計算 (Kinematic Geometry Update)**
   - 根據當前的主軸角度 `currentTheta`，透過 `getLegPositions` 計算出兩側（近側與遠側，有 180 度相位差）共六隻腳的理想空間幾何位置。
   - 此時的計算完全不考慮重力或地面，僅依賴曲柄連桿的絕對剛體幾何特性。

2. **尋找地面支撐點與姿態目標 (Ground Contact & Posture Target)**
   - 模擬器會將這六隻腳的底端視為點集合，並尋找其下邊緣的「凸包（Convex Hull）切線」。
   - 只要找到能穩定包容機身重心投影的切線（兩腳或多腳連線），這條線就代表「真實世界中的物理地面」。
   - 由這條線的斜率，反推出機器人此時「應該要有的傾角」（`targetRoll`）。

3. **姿態動力學更新 (Posture Dynamics)**
   - 機身並不會瞬間硬梆梆地貼平目標傾角，而是透過一個角速度變數 `bodyRollVel` 來進行逼近。
   - 利用 `bodyRoll += bodyRollVel * dt` 進行數值積分，產生平滑的機身俯仰（Pitching / Rocking）動作。

4. **觸地判定與正向力分配 (Ground Detection & Normal Force)**
   - 當機身傾角確定後，虛擬引擎會將機身向下平移，直到最低的一隻（或多隻）腳剛好觸碰到地面高度 `y_ground`。
   - 在極小容差 `CONTACT_TOL` 範圍內的腳會被標記為「觸地 (`isGrounded = true`)」。
   - 透過 `computeNormalForces`，根據重心在各觸地腳之間的 X 座標比例，將機身的重量（正向力 $F_N$）力矩平衡分配給所有觸地的腳。

5. **彈性足端與摩擦力計算 (Elastic Foot & Friction Physics)**
   - 對於每一隻觸地的腳，計算它相對於地面的「打滑位移（`slipDistance`）」與「瞬時滑動速度」。
   - 將這些數值代入彈簧阻尼模型，計算出每一隻腳與地面產生的水平剪切力（$F_x$）。
   - 將 $F_x$ 與最大靜摩擦力（$F_{max} = \mu F_N$）比較，若超過極限則判定為真實打滑（Skid），此時腳步將被迫在地面上拖行。

6. **機身平移積分 (Body Translation Integration)**
   - 將所有腳產生的推進力（正向）與拖曳阻力（負向）加總為淨推力 `totalForceX`。
   - 透過牛頓第二運動定律 $F = ma$，計算出機身加速度，並對速度 `bodyVelX` 與絕對位置 `bodyX` 進行數值積分（Explicit Euler Integration）。
   - 最後將位移量傳給背景控制器（Background Scroller）產生相對視覺移動。

---

## 2. 程式碼與真實世界物理的對應 (Code to Real-World Physics Mapping)

本模擬器並沒有使用 Box2D、Matter.js 等現成的剛體物理引擎，而是針對六足步態機器人的微觀特性，客製化了一套**彈性摩擦力模型（Penalty-based Friction Model）**。以下是程式碼變數與現實物理現象的對應：

### A. 腳掌彈性與變形 (Rubber Foot Elasticity)
* **對應真實物理：** 虎克定律（Hooke's Law） $F = -K \Delta x$
* **程式碼參數：** `footStiffness` (30 N/mm), `state.slipDistance`
* **說明：** 
  在真實世界中，當橡膠腳墊接觸地面並被機器人往後拉時，橡膠會先發生肉眼難見的「剪切形變（Shear Deformation）」而不是立刻打滑。程式中的 `slipDistance` 記錄的就是這個形變拉伸量。`footStiffness` 則代表橡膠的剛度。當腳在地上拖行時，其實是在拉扯一根隱形的彈簧，這根彈簧儲存的張力就是推動機器人前進的核心動力。

### B. 能量耗散與阻尼 (Energy Dissipation & Damping)
* **對應真實物理：** 黏滯阻尼（Viscous Damping） $F = -C v$
* **程式碼參數：** `footDamping` (0.4 N/(mm/s)), `slip_vel_real_mm`
* **說明：** 
  彈簧本身不會消耗能量，如果只有彈簧，機器人前進時會發生劇烈的前後共振。真實的橡膠與機械關節中存在著內摩擦與阻尼效應，能將震動的動能轉換為熱能消散。程式中的 `footDamping` 正是為了吸收多餘的高頻震盪，避免顯式積分的數值不穩定（Numerical Instability），確保推力的輸出是平滑線性的。

### C. 庫倫乾摩擦模型 (Coulomb Dry Friction)
* **對應真實物理：** 靜摩擦與動摩擦力極限 $F_{max} = \mu F_N$
* **程式碼參數：** `frictionCoeff` (0.8), `F_N`, `state.F_max`
* **說明：** 
  不論足尖橡膠拉得多長，它能提供的推力是有物理極限的。這個極限取決於這隻腳分攤到了多少機器人的重量（`F_N`）以及地面的粗糙程度（`frictionCoeff`）。當彈簧拉力超過這個極限時，程式會將出力強制截斷在 `F_max`，此時腳掌就會開始在地面上發生不可逆的真實滑動（打滑，紀錄於 `state.skid`）。

### D. 懸吊與柔性平衡 (Suspension & Balance)
* **對應真實物理：** 扭轉彈簧與旋轉阻尼阻力 $\tau = I \alpha$
* **程式碼參數：** `targetRoll`, `bodyRollVel`, `rollStiffness`
* **說明：** 
  機身姿態不會像幾何線條一樣瞬間改變。程式使用了一個隱形的扭轉阻尼系統（`rollStiffness`），試圖將機身角度（`bodyRoll`）平緩地拉向由腳尖決定的地面切線角度（`targetRoll`）。這完美模擬了機體重心的轉移與塑膠機構本身的柔性（Flexibility），讓步伐切換時的起伏變得有重量感且自然，而不是生硬的瞬間跳變。

### E. 慣性與動量 (Inertia & Momentum)
* **對應真實物理：** 牛頓第二運動定律 $a = \frac{\Sigma F}{m}$
* **程式碼參數：** `bodyMass` (10 kg), `totalForceX`, `bodyVelX`
* **說明：** 
  透過對所有的地面摩擦力求和得到淨力 `totalForceX`，除以機器人的質量 `bodyMass` 後得到加速度。這意味著機器人實體帶有「慣性（Inertia）」，如果因為地形起伏導致所有腳短暫騰空，機器人還會依賴殘餘的 `bodyVelX` 繼續向前滑行一小段距離（帶有些微的空氣與關節軸承阻力衰減 `bodyVelX *= 0.99`），還原了實體機器人因動能而產生的滑行感。
