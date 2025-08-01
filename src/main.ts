import "./style.css";
import { initUI } from "./ui/index";
import playerControls from "./player-controls";
import { getDevice, initWebGPU } from "./webgpu-init";
import { createBuffer, updateBuffer } from "./webgpu-buffers";
import { createBindGroupLayout, createBindGroup } from "./webgpu-bind-groups";

import { csgTree } from "./csg-tree";
//@ts-ignore
import PoissonDisk from "fast-2d-poisson-disk-sampling";
import { hasChanges } from "./has-changes";

const urlParams = new URLSearchParams(window.location.search);
const fractal = urlParams.get("fractal") || "mandelbulb";
let performance = parseInt(
  (urlParams.get("performance") as string | null) ?? "0",
);

const maxPerformance = 4;

let repeat = 2 ** performance;

const webgpuCanvas = document.getElementById(
  "webgpu-canvas",
) as HTMLCanvasElement;

// resize to prevent rounding errors
const width = window.innerWidth - (window.innerWidth % 8);
const height = window.innerHeight - (window.innerHeight % 8);
webgpuCanvas.width = width;
webgpuCanvas.height = height;

let frame = 0;
let step = 0;

window.addEventListener("keyup", (e: KeyboardEvent) => {
  if (
    Array(maxPerformance)
      .fill(0)
      .map((_, i) => i.toString())
      .includes(e.key)
  ) {
    const newSearch = new URLSearchParams(location.search);
    newSearch.set("performance", e.key);
    newSearch.set("position", playerControls.position.map((n) => n).join(","));
    newSearch.set(
      "direction",
      playerControls.state.cameraDirection.map((n) => n).join(","),
    );
    // location.href = `${location.origin}${location.pathname}?${newSearch}`
    performance = parseInt(e.key) - 1;
    repeat = 2 ** performance;
    step = 0;
    frame = 0;
  }
});

var treeBuffer: GPUBuffer | null = null;

export function updateTreeBuffer(flattenedTree: Float32Array) {
  if (!treeBuffer) return;
  updateBuffer(getDevice(), treeBuffer, flattenedTree);
}

async function main() {
  const webGPU = await initWebGPU(webgpuCanvas);
  if (!webGPU) return;

  const { device, context, format } = webGPU;

  // Vertex data (a simple quad)
  const vertices = new Float32Array([
    -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0,
  ]);
  const vertexBuffer = createBuffer(device, vertices, GPUBufferUsage.VERTEX);

  // Uniform buffer for SDF uniforms
  // This will be updated per frame/per tile
  const uniformBufferSize = 128; // Total size of SDFUniforms struct in WGSL, accounting for alignment and padding.

  const uniformBuffer = device.createBuffer({
    size: Math.ceil(uniformBufferSize / 32) * 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Uniform buffer for Upsample uniforms
  const upsampleUniformBufferSize =
    8 + // offset: vec2<f32> (8 bytes)
    4 + // step: f32 (4 bytes)
    4 + // repeat: f32 (4 bytes)
    8 + // screenSize: vec2<f32> (8 bytes)
    4; // totalSteps: f32 (4 bytes)
  const upsampleUniformBuffer = device.createBuffer({
    size: Math.ceil(upsampleUniformBufferSize / 32) * 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Storage buffer for the blob tree
  const flattenedTree = csgTree.serializeTreeForWebGPU();
  treeBuffer = createBuffer(
    device,
    flattenedTree,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  );

  // Load shaders
  const passThroughVertCode = await (
    await fetch("/src/wgsl-shaders/pass-through.wgsl")
  ).text();

  const passThroughVertModule = device.createShaderModule({
    label: "Pass Through Vertex Shader",
    code: passThroughVertCode,
  });

  let fractalFragModule: GPUShaderModule = device.createShaderModule({
    label: "Fractal Fragment Shader",
    code: await (await fetch(`/src/wgsl-shaders/${fractal}.wgsl`)).text(),
  });

  const upsampleFragCode = await (
    await fetch("/src/wgsl-shaders/upsample.wgsl")
  ).text();
  const upsampleFragModule = device.createShaderModule({
    label: "Upsample Fragment Shader",
    code: upsampleFragCode,
  });

  // Create bind group layout and bind group for fractal rendering
  const fractalBindGroupLayout = createBindGroupLayout(device, [
    {
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: "uniform" },
    },
    {
      binding: 1,
      visibility: GPUShaderStage.FRAGMENT,
      buffer: { type: "read-only-storage" },
    },
  ]);
  const fractalBindGroup = createBindGroup(device, fractalBindGroupLayout, [
    {
      binding: 0,
      resource: { buffer: uniformBuffer },
    },
    {
      binding: 1,
      resource: { buffer: treeBuffer },
    },
  ]);

  // Create render pipeline for fractal rendering
  const fractalRenderPipeline = device.createRenderPipeline({
    label: "Fractal Render Pipeline",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [fractalBindGroupLayout],
    }),
    vertex: {
      module: passThroughVertModule,
      entryPoint: "main",
      buffers: [
        {
          arrayStride: 2 * 4, // 2 floats * 4 bytes/float
          attributes: [
            {
              shaderLocation: 0,
              offset: 0,
              format: "float32x2",
            },
          ],
        },
      ],
    },
    fragment: {
      module: fractalFragModule,
      entryPoint: "main",
      targets: [
        {
          format: format,
        },
      ],
    },
    primitive: {
      topology: "triangle-list",
    },
  });

  // Create bind group layout and bind group for upsampling
  const upsampleBindGroupLayout = createBindGroupLayout(device, [
    {
      binding: 0,
      visibility: GPUShaderStage.FRAGMENT,
      buffer: { type: "uniform" },
    },
    {
      binding: 1,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: "float" },
    },
    {
      binding: 2,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: "float" },
    },
    {
      binding: 3,
      visibility: GPUShaderStage.FRAGMENT,
      sampler: { type: "filtering" },
    },
    {
      binding: 4,
      visibility: GPUShaderStage.FRAGMENT,
      sampler: { type: "non-filtering" },
    },
  ]);

  const textureSampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });

  const nearestSampler = device.createSampler({
    magFilter: "nearest",
    minFilter: "nearest",
  });

  // Create render pipeline for upsampling
  const upsampleRenderPipeline = device.createRenderPipeline({
    label: "Upsample Render Pipeline",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [upsampleBindGroupLayout],
    }),
    vertex: {
      module: passThroughVertModule,
      entryPoint: "main",
      buffers: [
        {
          arrayStride: 2 * 4, // 2 floats * 4 bytes/float
          attributes: [
            {
              shaderLocation: 0,
              offset: 0,
              format: "float32x2",
            },
          ],
        },
      ],
    },
    fragment: {
      module: upsampleFragModule,
      entryPoint: "main",
      targets: [
        {
          format: format,
        },
      ],
    },
    primitive: {
      topology: "triangle-list",
    },
  });

  // Framebuffers for precision rendering (ping-ponging)
  const precisionFbos: {
    fbo: GPUTexture;
    shape: [number, number];
    offsets: [number, number][];
  }[] = Array(maxPerformance)
    .fill(0)
    .map((_, i) => {
      const repeat = 2 ** i;
      const shape: [number, number] = [width / repeat, height / repeat];

      const texture = device.createTexture({
        size: { width: shape[0], height: shape[1], depthOrArrayLayers: 1 },
        format: format,
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });

      function shuffleArray(array: any[]) {
        for (let i = array.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [array[i], array[j]] = [array[j], array[i]];
        }
      }

      const offsets: [number, number][] = new PoissonDisk({
        shape: [repeat, repeat],
        radius: 0.1,
      }).fill();

      shuffleArray(offsets);
      offsets.unshift([repeat / 2, repeat / 2]);

      return {
        fbo: texture,
        shape,
        offsets,
      };
    });

  const screenTex1 = device.createTexture({
    size: { width, height, depthOrArrayLayers: 1 },
    format: format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });

  const screenTex2 = device.createTexture({
    size: { width, height, depthOrArrayLayers: 1 },
    format: format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });

  const pingpong = (frame: number) =>
    frame % 2 === 0 ? [screenTex1, screenTex2] : [screenTex2, screenTex1];

  let from: GPUTexture;
  let start = Date.now();

  function loop() {
    const state = playerControls.state;
    const has_changes = hasChanges.value;
    hasChanges.value = false;
    const { fbo, shape, offsets } = precisionFbos[performance];
    const [source, target] = pingpong(frame);
    if (!from) from = source;
    if (has_changes) {
      step = 0;
    }

    if (step < offsets.length) {
      const offset = offsets[step];

      // Update uniform buffer for fractal rendering
      const uniformValues = new Float32Array([
        shape[0],
        shape[1], // screenSize
        offset[0],
        offset[1], // offset
        repeat,
        repeat, // repeat (assuming repeat is a single number for both x and y)
        0, // time (not used in current shaders, but good to have)
        0, // alignment
        state.cameraPosition[0],
        state.cameraPosition[1],
        state.cameraPosition[2],
        0, // cameraPosition with padding
        ...state.cameraDirection, // cameraDirection (mat4x4)
        0, // onlyDistance (boolean, 0 or 1)
        state.scrollX, // scrollX
        state.scrollY, // scrollY
        0,
      ]);

      updateBuffer(device, uniformBuffer, uniformValues);

      const commandEncoder = device.createCommandEncoder();

      // Render to FBO (fractal rendering)
      const renderPassDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [
          {
            view: fbo.createView(),
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      };
      let passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
      passEncoder.setPipeline(fractalRenderPipeline);
      passEncoder.setVertexBuffer(0, vertexBuffer);
      passEncoder.setBindGroup(0, fractalBindGroup);
      passEncoder.draw(6);
      passEncoder.end();

      // Upsample pass
      const upsampleUniformValues = new Float32Array([
        offset[0],
        offset[1], // offset
        step, // step
        repeat, // repeat
        width,
        height, // screenSize
        offsets.length, // totalSteps
      ]);
      updateBuffer(device, upsampleUniformBuffer, upsampleUniformValues);

      const upsampleBindGroup = createBindGroup(
        device,
        upsampleBindGroupLayout,
        [
          {
            binding: 0,
            resource: { buffer: upsampleUniformBuffer },
          },
          {
            binding: 1,
            resource: fbo.createView(),
          },
          {
            binding: 2,
            resource: from.createView(),
          },
          {
            binding: 3,
            resource: textureSampler,
          },
          {
            binding: 4,
            resource: nearestSampler,
          },
        ],
      );

      const upsamplePassDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [
          {
            view: target.createView(),
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      };
      passEncoder = commandEncoder.beginRenderPass(upsamplePassDescriptor);
      passEncoder.setPipeline(upsampleRenderPipeline);
      passEncoder.setVertexBuffer(0, vertexBuffer);
      passEncoder.setBindGroup(0, upsampleBindGroup);
      passEncoder.draw(6);
      passEncoder.end();

      // Draw to canvas
      const canvasTexture = context.getCurrentTexture();
      const canvasView = canvasTexture.createView();
      const renderPassDescriptorCanvas: GPURenderPassDescriptor = {
        colorAttachments: [
          {
            view: canvasView,
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      };
      passEncoder = commandEncoder.beginRenderPass(renderPassDescriptorCanvas);
      passEncoder.setPipeline(upsampleRenderPipeline); // Use upsample pipeline to draw final result
      passEncoder.setVertexBuffer(0, vertexBuffer);
      passEncoder.setBindGroup(0, upsampleBindGroup); // Use upsample bind group for final result
      passEncoder.draw(6);
      passEncoder.end();

      device.queue.submit([commandEncoder.finish()]);
    }

    const FRAMES = 60;
    const MARGIN = 2;
    if (frame % FRAMES === 0) {
      const current = Date.now();
      const diff = current - start;
      start = current;
      if (has_changes) {
        const avgFrameTime = diff / FRAMES;
        const fps = 1000 / avgFrameTime;
        console.log(frame, fps);
        // console.log("fps", fps);
        let nextPerformance: number = performance;
        if (fps > 120 - MARGIN) {
          nextPerformance = Math.max(0, performance - 1);
        } else if (fps < 60 - MARGIN) {
          nextPerformance = Math.min(maxPerformance - 1, performance + 1);
        }
        // nextPerformance = 3;
        performance = nextPerformance;
        repeat = 2 ** nextPerformance;
        console.log(performance);
      }
    }

    requestAnimationFrame(loop);

    from = target;

    step++;
    frame++;
  }

  loop();
}

main();
initUI();
