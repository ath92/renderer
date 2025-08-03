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
@group(0) @binding(5) var existingDepthTexture: texture_2d<f32>;

struct FragOutput {
    @location(0) color: vec4<f32>,
    @location(1) depth: f32,
};

@fragment
fn main(@location(0) uv: vec2<f32>, @builtin(position) fragCoord: vec4<f32>) -> FragOutput {
    let xy = (fragCoord.xy - vec2(.0)) / u.screenSize;
    let m = (fragCoord.xy - vec2(.0)) % u.repeat;

    let current_color = textureSample(existingTexture, textureSampler, xy);
    let current_depth = textureSample(existingDepthTexture, nearestSampler, xy).r;

    let tex_coord = vec2<i32>(floor(fragCoord.xy / u.repeat));
    let sample_color = textureLoad(inputTexture, tex_coord, 0);
    let sample_depth = sample_color.a;

    let maxDist = 1.41421356237 * u.repeat;
    let d = distance(m, u.offset);

    let w = pow(0.5, pow(d, .7) * pow(u.step, .3));
    let weight = clamp(w, 0., 1.);

    var output: FragOutput;
    output.color = mix(current_color, sample_color, weight);
    output.depth = mix(current_depth, sample_depth, weight);

    return output;
}
