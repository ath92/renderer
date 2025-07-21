export async function initWebGPU(canvas: HTMLCanvasElement): Promise<{ device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat } | undefined> {
    if (!navigator.gpu) {
        console.error("WebGPU not supported on this browser.");
        return undefined;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        console.error("No WebGPU adapter found.");
        return undefined;
    }

    const device = await adapter.requestDevice();
    if (!device) {
        console.error("No WebGPU device found.");
        return undefined;
    }

    const context = canvas.getContext("webgpu");
    if (!context) {
        console.error("Could not get WebGPU context.");
        return undefined;
    }

    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: format,
        alphaMode: "premultiplied",
    });

    return { device, context, format };
}
