import "./style.css";
import { initUI } from "./ui/index";
import threeControls from "./three-controls";
import { getDevice, initWebGPU } from "./webgpu-init";
import { createBuffer, updateBuffer } from "./webgpu-buffers";
import { createBindGroupLayout, createBindGroup } from "./webgpu-bind-groups";
import * as THREE from "three";

import { csgChangeCounter, csgTree } from "./csg-tree";
//@ts-ignore
import PoissonDisk from "fast-2d-poisson-disk-sampling";
import { hasChanges } from "./has-changes";

const urlParams = new URLSearchParams(window.location.search);
const shader = urlParams.get("shader") || urlParams.get("fractal") || "blob-tree";
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
let requestDepthReadback = false;

window.addEventListener("keyup", (e: KeyboardEvent) => {
  if (e.key === "d") {
    requestDepthReadback = true;
    console.log("Depth readback requested.");
  }
  if (
    Array(maxPerformance)
      .fill(0)
      .map((_, i) => i.toString())
      .includes(e.key)
  ) {
    const newSearch = new URLSearchParams(location.search);
    newSearch.set("performance", e.key);
    newSearch.set("position", threeControls.position.join(","));
    newSearch.set("target", threeControls.target.join(","));
    // location.href = `${location.origin}${location.pathname}?${newSearch}`
    performance = parseInt(e.key) - 1;
    repeat = 2 ** performance;
    step = 0;
    frame = 0;
  }
});

var treeBuffer: GPUBuffer | null = null;
var uniformBuffer: GPUBuffer | null = null;
var shaderBindGroupLayout: GPUBindGroupLayout | null = null;
var shaderBindGroup: GPUBindGroup | null = null;

var depthReadbackBuffer: GPUBuffer | null = null;

let depthReadbackPromise: Promise<number> | null = null;
export async function depthReadback(x: number, y: number) {
  if (!depthReadbackBuffer)
    throw new Error("depth readback buffer not initialized");

  depthReadbackPromise = depthReadbackBuffer
    .mapAsync(GPUMapMode.READ)
    .then(() => {
      const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
      const depthData = new Float32Array(depthReadbackBuffer!.getMappedRange());
      console.log("Depth data:", depthData.length, width * height);
      const row = Math.round(y - webgpuCanvas.offsetTop);
      const col = Math.round(x - webgpuCanvas.offsetLeft);
      const index = (row * bytesPerRow) / 4 + col;
      const d = depthData[index];
      console.log("depth at pixel", d, index);
      depthReadbackBuffer!.unmap();
      return d;
    });

  return depthReadbackPromise;
}

export function updateTreeBuffer(flattenedTree: Float32Array) {
  const device = getDevice();
  if (!device || !treeBuffer || !uniformBuffer || !shaderBindGroupLayout)
    return;

  console.log("update tree buffer");

  if (flattenedTree.byteLength > treeBuffer.size) {
    console.log(
      `Resizing tree buffer from ${treeBuffer.size} to ${flattenedTree.byteLength}`,
    );
    treeBuffer.destroy();
    treeBuffer = createBuffer(
      device,
      flattenedTree,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    );
    shaderBindGroup = createBindGroup(device, shaderBindGroupLayout, [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: treeBuffer } },
    ]);
  } else {
    updateBuffer(device, treeBuffer, flattenedTree);
  }
}

async function main() {
  const webGPU = await initWebGPU(webgpuCanvas);
  if (!webGPU) return;

  const { device, context, format } = webGPU;

  // Initialize threeControls with a camera for the WebGPU renderer
  const camera = new THREE.PerspectiveCamera(
    53.13,
    webgpuCanvas.width / webgpuCanvas.height,
    0.1,
    1000
  );
  threeControls.initialize(camera, webgpuCanvas);

  // Vertex data (a simple quad)
  const vertices = new Float32Array([
    -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0,
  ]);
  const vertexBuffer = createBuffer(device, vertices, GPUBufferUsage.VERTEX);

  // Uniform buffer for SDF uniforms
  const uniformBufferSize = 128;
  uniformBuffer = device.createBuffer({
    size: Math.ceil(uniformBufferSize / 32) * 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Uniform buffer for Upsample uniforms
  const upsampleUniformBufferSize = 8 + 4 + 4 + 8 + 4;
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
    await fetch("/wgsl-shaders/pass-through.wgsl")
  ).text();
  const passThroughVertModule = device.createShaderModule({
    label: "Pass Through Vertex Shader",
    code: passThroughVertCode,
  });

  const shaderFragCode = await (
    await fetch(`/wgsl-shaders/${shader}.wgsl`)
  ).text();
  const shaderFragModule = device.createShaderModule({
    label: "SDF Shader Fragment Shader",
    code: shaderFragCode,
  });

  const upsampleFragCode = await (
    await fetch("/wgsl-shaders/upsample.wgsl")
  ).text();
  const upsampleFragModule = device.createShaderModule({
    label: "Upsample Fragment Shader",
    code: upsampleFragCode,
  });

  const blitFragCode = await (
    await fetch("/wgsl-shaders/blit.wgsl")
  ).text();
  const blitFragModule = device.createShaderModule({
    label: "Blit Fragment Shader",
    code: blitFragCode,
  });

  // Create bind group layout and bind group for SDF rendering
  shaderBindGroupLayout = createBindGroupLayout(device, [
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
  shaderBindGroup = createBindGroup(device, shaderBindGroupLayout, [
    { binding: 0, resource: { buffer: uniformBuffer } },
    { binding: 1, resource: { buffer: treeBuffer } },
  ]);

  // Create render pipeline for SDF rendering
  const shaderRenderPipeline = device.createRenderPipeline({
    label: "SDF Render Pipeline",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [shaderBindGroupLayout],
    }),
    vertex: {
      module: passThroughVertModule,
      entryPoint: "main",
      buffers: [
        {
          arrayStride: 2 * 4,
          attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
        },
      ],
    },
    fragment: {
      module: shaderFragModule,
      entryPoint: "main",
      targets: [{ format: "rgba32float" }],
    },
    primitive: { topology: "triangle-list" },
  });

  // Create bind group layout for upsampling
  const upsampleBindGroupLayout = createBindGroupLayout(device, [
    {
      binding: 0,
      visibility: GPUShaderStage.FRAGMENT,
      buffer: { type: "uniform" },
    },
    {
      binding: 1,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: "unfilterable-float" },
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
    {
      binding: 5,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: "unfilterable-float" },
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
          arrayStride: 2 * 4,
          attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
        },
      ],
    },
    fragment: {
      module: upsampleFragModule,
      entryPoint: "main",
      targets: [{ format: format }, { format: "r32float" }],
    },
    primitive: { topology: "triangle-list" },
  });

  // Create bind group layout and pipeline for blitting to canvas
  const blitBindGroupLayout = createBindGroupLayout(device, [
    {
      binding: 0,
      visibility: GPUShaderStage.FRAGMENT,
      sampler: { type: "filtering" },
    },
    {
      binding: 1,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: "float" },
    },
  ]);

  const blitRenderPipeline = device.createRenderPipeline({
    label: "Blit Render Pipeline",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [blitBindGroupLayout],
    }),
    vertex: {
      module: passThroughVertModule,
      entryPoint: "main",
      buffers: [
        {
          arrayStride: 2 * 4,
          attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
        },
      ],
    },
    fragment: {
      module: blitFragModule,
      entryPoint: "main",
      targets: [{ format: format }],
    },
    primitive: { topology: "triangle-list" },
  });

  // Framebuffers for precision rendering
  const precisionFbos = Array(maxPerformance)
    .fill(0)
    .map((_, i) => {
      const r = 2 ** i;
      const shape: [number, number] = [width / r, height / r];
      const texture = device.createTexture({
        size: { width: shape[0], height: shape[1], depthOrArrayLayers: 1 },
        format: "rgba32float",
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      const offsets = new PoissonDisk({ shape: [r, r], radius: 0.1 }).fill();
      offsets.sort(() => Math.random() - 0.5);
      offsets.unshift([r / 2, r / 2]);
      return { fbo: texture, shape, offsets };
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
  const depthTex1 = device.createTexture({
    size: { width, height, depthOrArrayLayers: 1 },
    format: "r32float",
    usage:
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC,
  });
  const depthTex2 = device.createTexture({
    size: { width, height, depthOrArrayLayers: 1 },
    format: "r32float",
    usage:
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC,
  });

  const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
  depthReadbackBuffer = device.createBuffer({
    size: bytesPerRow * height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const pingpong = (frame: number) =>
    frame % 2 === 0
      ? [screenTex1, screenTex2, depthTex1, depthTex2]
      : [screenTex2, screenTex1, depthTex2, depthTex1];

  let from: GPUTexture, fromDepth: GPUTexture;
  let start = Date.now();

  let change_counter = csgChangeCounter.peek();
  async function loop() {
    if (depthReadbackPromise) await depthReadbackPromise;
    
    // Update threeControls for dampening and camera state
    threeControls.update();
    
    const state = threeControls.state;
    const latest_counter = csgChangeCounter.peek();
    const csg_tree_has_changes = change_counter !== latest_counter;
    const has_changes = hasChanges.value || csg_tree_has_changes;
    change_counter = latest_counter;
    if (csg_tree_has_changes) {
      updateTreeBuffer(csgTree.serializeTreeForWebGPU());
    }
    hasChanges.value = false;
    const { fbo, shape, offsets } = precisionFbos[performance];
    const [source, target, sourceDepth, targetDepth] = pingpong(frame);
    if (!from) from = source;
    if (!fromDepth) fromDepth = sourceDepth;
    if (has_changes) step = 0;

    if (requestDepthReadback) requestDepthReadback = false;

    if (step < offsets.length) {
      const offset = offsets[step];
      const uniformValues = new Float32Array([
        shape[0],
        shape[1],
        offset[0],
        offset[1],
        repeat,
        repeat,
        0,
        0,
        state.cameraPosition[0],
        state.cameraPosition[1],
        state.cameraPosition[2],
        0,
        ...state.cameraDirection,
        0,
        state.scrollX,
        state.scrollY,
        0,
      ]);
      updateBuffer(device, uniformBuffer!, uniformValues);

      const commandEncoder = device.createCommandEncoder();

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
      passEncoder.setPipeline(shaderRenderPipeline);
      passEncoder.setVertexBuffer(0, vertexBuffer);
      passEncoder.setBindGroup(0, shaderBindGroup!);
      passEncoder.draw(6);
      passEncoder.end();

      const upsampleUniformValues = new Float32Array([
        offset[0],
        offset[1],
        step,
        repeat,
        width,
        height,
        offsets.length,
      ]);
      updateBuffer(device, upsampleUniformBuffer, upsampleUniformValues);

      const upsampleBindGroup = createBindGroup(
        device,
        upsampleBindGroupLayout,
        [
          { binding: 0, resource: { buffer: upsampleUniformBuffer } },
          { binding: 1, resource: fbo.createView() },
          { binding: 2, resource: from.createView() },
          { binding: 3, resource: textureSampler },
          { binding: 4, resource: nearestSampler },
          { binding: 5, resource: fromDepth.createView() },
        ],
      );

      const upsamplePassDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [
          {
            view: target.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
          {
            view: targetDepth.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
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

      const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
      commandEncoder.copyTextureToBuffer(
        { texture: targetDepth },
        { buffer: depthReadbackBuffer!, bytesPerRow },
        { width, height },
      );

      const canvasView = context.getCurrentTexture().createView();
      const blitBindGroup = createBindGroup(device, blitBindGroupLayout, [
        { binding: 0, resource: textureSampler },
        { binding: 1, resource: target.createView() },
      ]);

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
      passEncoder.setPipeline(blitRenderPipeline);
      passEncoder.setVertexBuffer(0, vertexBuffer);
      passEncoder.setBindGroup(0, blitBindGroup);
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
        let nextPerformance = performance;
        if (fps > 120 - MARGIN) nextPerformance = Math.max(0, performance - 1);
        else if (fps < 40 - MARGIN)
          nextPerformance = Math.min(maxPerformance - 1, performance + 1);
        // if (performance !== nextPerformance) hasChanges.value = true;
        // nextPerformance = 3;
        performance = nextPerformance;
        repeat = 2 ** nextPerformance;
        console.log(performance);
      }
    }

    requestAnimationFrame(loop);

    from = target;
    fromDepth = targetDepth;
    step++;
    frame++;
  }

  loop();
}

main();
initUI();
