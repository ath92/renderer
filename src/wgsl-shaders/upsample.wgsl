struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

struct Uniforms {
    offset: vec2<f32>,
    step: f32,
    repeat: f32,
    screenSize: vec2<f32>,
    totalSteps: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var existingTexture: texture_2d<f32>;
@group(0) @binding(3) var textureSampler: sampler;

@fragment
fn main(@location(0) uv: vec2<f32>, @builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let xy = fragCoord.xy / u.screenSize;
    let m = fragCoord.xy % u.repeat;

    let current = textureSample(existingTexture, textureSampler, xy);
    let samplexy = xy + ((m - u.offset) / 2.0) / u.screenSize;
    let sample = textureSample(inputTexture, textureSampler, samplexy);

    let maxDist = sqrt(2.0 * u.repeat * u.repeat);
    let d = distance(m, u.offset) / maxDist;
    let dist = min(d, 1.00 - d);

    let weight = clamp(pow((1.0 - dist), pow(u.step, sqrt(2.0) / 2.0)), 0.0, 1.0);
    return mix(current, sample, weight);
}
