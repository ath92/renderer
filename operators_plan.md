# Implementing Blob Tree Operators in WGSL

## Goal
To extend the `blob-tree.wgsl` shader to support various SDF operators (union, subtract, intersect, and their smooth variants) and correctly apply the smoothing factor based on the `blob-tree.ts` data structure.

## Step-by-Step Plan

1.  **Analyze `src/blob-tree.ts` (Current Step)**
    *   Read the `src/blob-tree.ts` file to understand:
        *   The `Node` structure and its properties related to operators and smoothing.
        *   How operator types (e.g., `OpType` enum) are defined.
        *   How the smoothing factor is stored.
        *   How this data is serialized into the `Float32Array` for WebGPU (specifically, what `type_op_data1` in the WGSL `Node` struct corresponds to in the TypeScript `Node` serialization).

2.  **Define WGSL Operators**
    *   Based on the operators identified in `blob-tree.ts`, implement the following WGSL functions:
        *   `op_union(a: f32, b: f32) -> f32` (equivalent to `min(a, b)`)
        *   `op_subtract(a: f32, b: f32) -> f32` (equivalent to `max(a, -b)`)
        *   `op_intersect(a: f32, b: f32) -> f32` (equivalent to `max(a, b)`)
        *   `op_smooth_union(a: f32, b: f32, k: f32) -> f32` (using `quadratic_smin` or similar)
        *   `op_smooth_subtract(a: f32, b: f32, k: f32) -> f32`
        *   `op_smooth_intersect(a: f32, b: f32, k: f32) -> f32`
    *   Ensure these functions correctly implement the SDF combination logic.

3.  **Update `Node` struct in `blob-tree.wgsl`**
    *   Verify and, if necessary, adjust the `Node` struct in `src/wgsl-shaders/blob-tree.wgsl` to ensure `type_op_data1.y` correctly represents the operator type and `type_op_data1.z` correctly represents the smoothing factor.

4.  **Modify `evaluate_scene_sdf_bvh_2` in `blob-tree.wgsl`**
    *   Inside the `while (index >= 0)` loop, when `node_type == 0.` (operator node):
        *   Read the operator type from `node.type_op_data1.y`.
        *   Read the smoothing factor from `node.type_op_data1.z`.
        *   Use a `switch` statement or `if/else if` chain to call the appropriate WGSL operator function (`op_union`, `op_smooth_union`, etc.) based on the operator type.
        *   Pass the smoothing factor `k` to the smooth operator functions.
        *   Ensure the result of the operator is correctly combined with the `sdf_result.distance`.

5.  **Test and Verify**
    *   Run the application and visually inspect the rendered output to confirm that different operators and smoothing factors are being applied correctly.
    *   Check for any console errors or warnings related to WebGPU.
    *   If possible, create or modify a simple blob tree in `blob-tree.ts` to specifically test each operator.
