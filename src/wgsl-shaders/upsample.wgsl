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
@group(0) @binding(4) var nearestSampler: sampler;

@fragment
fn main(@location(0) uv: vec2<f32>, @builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let xy = (fragCoord.xy - vec2(.0)) / u.screenSize;
    let m = (fragCoord.xy - vec2(.0)) % u.repeat;

    let current = textureSample(existingTexture, textureSampler, xy);
    let samplexy = xy;
    let sample = textureSample(inputTexture, nearestSampler, samplexy);

    let maxDist = 1.41421356237 * u.repeat;
    let d = distance(m, u.offset);


    let w = pow(0.5, pow(d, .7) * pow(u.step, .3));



    let weight = clamp(w, 0., 1.);
    return mix(current, sample, weight);
}
