export function createBindGroupLayout(device: GPUDevice, entries: GPUBindGroupLayoutEntry[]): GPUBindGroupLayout {
    return device.createBindGroupLayout({ entries });
}

export function createBindGroup(device: GPUDevice, layout: GPUBindGroupLayout, entries: GPUBindGroupEntry[]): GPUBindGroup {
    return device.createBindGroup({
        layout: layout,
        entries: entries,
    });
}
