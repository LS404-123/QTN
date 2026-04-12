# Project: 2D Hopping Robot Simulation (QTN) - Agent Context

This file provides a summary of the current project state and critical physics logic for future agents.

## Core Architecture
- **Environment**: Single HTML/JS file (`蹦跳機械.html`) using SVG for rendering.
- **Robot Structure**: 
    - A rigid body (Main board + legs).
    - An internal active crane (motorized arm) that rotates relative to the body, shifting the Center of Mass (COM).
    - A PVC ring spring used for elastic hopping.

## Physics Engine (Plan A: Pivot-Constrained)
The simulation currently uses a **"Hard Kinematic Constraint"** logic for ground stability:
1. **Pivot Detection**: When the wood leg touches the ground, one corner is selected as the `activePivotSite`.
2. **Persistent Anchor**: Once a pivot is established, its world coordinates are locked (`pivotWorldX`, `pivotWorldY = GROUND_Y`) to prevent sliding/drifting.
3. **Rigid Body Dynamics**: Rotation is calculated around the pivot using the Parallel Axis Theorem ($I_{pivot} = I_{com} + M r^2$).
4. **Internal Weight Shift**: 
    - The COM moves relative to the pivot as the crane rotates.
    - **CRITICAL**: The COM velocity ($\vec{v}_{com}$) must include the internal shifting velocity ($\vec{v}_{rel}$) derived from position deltas to ensure correct damping and momentum transfer.

## Release Logic (Fn-Based)
The robot "hops" when the virtual Normal Force $F_n$ at the pivot becomes negative:
$$F_n = M \cdot (- \alpha \cdot r_x - \omega^2 \cdot r_y) - F_{total, y}$$
If $F_n < -1000$ (sticky threshold) and the pivot is visually above ground, the anchor is released.

## Key Files
- `蹦跳機械.html`: Main implementation.
- `reply.md`: Technical deep-dives on mathematical derivations.
- `.gemini/antigravity/brain/.../walkthrough.md`: Historical record of changes.

## Development Rules
- **Aesthetics**: Maintain high-quality SVG visuals and telemetry displays.
- **Physics**: Always prefer surgical edits to the sub-step integration loop. Maintain the `SUBSTEPS = 15` resolution.
- **Communication**: If you update `reply.md` with technical details, only mention it with a single sentence in the chat response (e.g., "I have updated the technical details in reply.md.").
