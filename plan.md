# WebGPU Conversion Plan

This plan outlines the steps to convert the existing WebGL/regl application to a WebGPU equivalent, located in a new `src2` directory.

## Phase 1: Project Setup and Initial Analysis

1.  **Create `src2` Directory:**
    *   Create a new directory `/Users/tomhutman/Documents/2023/renderer/src2`.
    *   Copy non-rendering related files from `src` to `src2` (e.g., `player-controls.ts`, `style.css`, `typescript.svg`, `vite-env.d.ts`).
    *   Update `index.html` to point to `src2/main.ts` for the new WebGPU version.

2.  **Analyze Existing WebGL/regl Codebase:**
    *   **`main.ts`:** Understand the main rendering loop, `regl` command definitions, and how shaders are loaded and used.
    *   **`pass-through-vert.glsl`:** Analyze vertex attributes, uniforms, and output varying.
    *   **`fragment-shaders/*.glsl`:** Analyze fragment shader inputs (varyings, uniforms), texture sampling, and output color.
    *   **Data Flow:** Identify how vertex data, uniform data, and texture data are prepared and passed to `regl` commands.

## Phase 2: WebGPU Core Setup

1.  **WebGPU Initialization (`src2/webgpu-init.ts`):**
    *   Implement a function to request a `GPUAdapter` and `GPUDevice`.
    *   Configure the `HTMLCanvasElement` for WebGPU rendering (get `GPUCanvasContext`).
    *   Handle potential errors (e.g., WebGPU not supported).

2.  **Shader Conversion (GLSL to WGSL):**
    *   Create a new directory `src2/wgsl-shaders`.
    *   Manually convert `pass-through-vert.glsl` to `pass-through.wgsl` (vertex shader).
    *   Manually convert each `fragment-shaders/*.glsl` to corresponding `*.wgsl` files.
    *   **Key Conversion Points:**
        *   `attribute` -> `@location(N) var<in>`
        *   `uniform` -> `var<uniform> Name: Type;` within a `struct` and `var<group(G) binding(B)>`
        *   `varying` -> `var<out>` in vertex shader, `var<in>` in fragment shader with `@location(N)`
        *   `texture2D` -> `textureSample` with `sampler` and `texture_2d`
        *   `gl_Position` -> `@builtin(position) var<out> position: vec4<f32>;`
        *   `gl_FragColor` -> `@location(0) var<out> outColor: vec4<f32>;`
        *   Data types (e.g., `vec2`, `vec3`, `vec4`, `mat4`, `float`, `int`).

## Phase 3: WebGPU Rendering Pipeline Construction

1.  **Buffer Creation and Management (`src2/webgpu-buffers.ts`):**
    *   Implement functions to create `GPUBuffer` for vertex data (e.g., positions, UVs).
    *   Implement functions to create `GPUBuffer` for uniform data.
    *   Handle data uploads to GPU buffers.

2.  **Bind Group Layouts and Bind Groups (`src2/webgpu-bind-groups.ts`):**
    *   Define `GPUBindGroupLayout` based on the uniforms and textures used in the shaders.
    *   Create `GPUBindGroup` instances, linking buffers and textures to their respective bindings.

3.  **Render Pipeline Creation (`src2/webgpu-pipeline.ts`):**
    *   Implement a function to create a `GPURenderPipeline`.
    *   This will involve:
        *   Loading WGSL shader modules.
        *   Defining vertex buffer layouts (`GPUVertexBufferLayout`).
        *   Configuring the primitive state (e.g., `triangle-list`).
        *   Setting up the color target state (format, blend).
        *   Setting the `GPUBindGroupLayout`s.

## Phase 4: Rendering Loop and Command Submission

1.  **Main Rendering Logic (`src2/main.ts`):**
    *   Integrate WebGPU initialization.
    *   Create and manage the `GPURenderPipeline` and `GPUBindGroup`s.
    *   Implement the rendering loop (e.g., `requestAnimationFrame`).
    *   Inside the loop:
        *   Get the current texture from the swap chain (`getCurrentTexture()`).
        *   Create a `GPUCommandEncoder`.
        *   Begin a `GPURenderPassEncoder`.
        *   Set the render pipeline.
        *   Set bind groups.
        *   Set vertex and index buffers.
        *   Issue draw calls (`draw()` or `drawIndexed()`).
        *   End the render pass.
        *   Finish the command encoder and submit the command buffer to the device queue.

## Phase 5: Integration and Refinement

1.  **Player Controls Integration:**
    *   Ensure `player-controls.ts` can interact with the new WebGPU rendering logic to update uniforms (e.g., camera position, fractal parameters).

2.  **Error Handling and Debugging:**
    *   Add robust error handling for WebGPU API calls.
    *   Utilize browser developer tools for WebGPU debugging.

3.  **Performance Optimization (if necessary):**
    *   Consider techniques like instancing, culling, and efficient buffer updates.

## Deliverables

*   `src2/` directory containing the WebGPU version of the application.
*   `plan.md` (this file) detailing the conversion process.
*   Updated `index.html` to load `src2/main.ts`.
