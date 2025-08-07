struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

struct Uniforms {
    screenSize: vec2<f32>,
    offset: vec2<f32>,
    repeat: vec2<f32>,
    time: f32,
    cameraPosition: vec3<f32>,
    cameraDirection: mat4x4<f32>,
    onlyDistance: u32, // bools are often u32 in WGSL uniforms
    scrollX: f32,
    scrollY: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

const hitThreshold: f32 = 0.00003;
const CAMERA_ITERATIONS: u32 = 240;
const LIGHT_ITERATIONS: u32 = 0;
const spaceRepetition: vec3<f32> = vec3<f32>(12.0, 5.15, 6.0);
const theta: f32 = 0.5 * 3.14;

// rotation matrix used to rotate the scene 90deg around x axis
fn xAxis_fn() -> mat3x3<f32> {
    return mat3x3<f32>(
        vec3<f32>(1.0, 0.0, 0.0),
        vec3<f32>(0.0, cos(theta), -sin(theta)),
        vec3<f32>(0.0, sin(theta), cos(theta))
    );
}

// and one for rotating 90deg around y axis
fn yAxis_fn() -> mat3x3<f32> {
    return mat3x3<f32>(
        vec3<f32>(cos(theta), 0.0, sin(theta)),
        vec3<f32>(0.0, 1.0, 0.0),
        vec3<f32>(-sin(theta), 0.0, cos(theta))
    );
}

fn rotmat_fn() -> mat3x3<f32> {
    return xAxis_fn() * yAxis_fn();
}

fn getRay(fragCoord: vec4<f32>) -> vec3<f32> {
    let normalizedCoords = fragCoord.xy - vec2<f32>(0.5) + (u.offset / u.repeat);
    let pixel = (normalizedCoords - 0.5 * u.screenSize) / min(u.screenSize.x, u.screenSize.y);
    return normalize((u.cameraDirection * vec4<f32>(pixel.x, pixel.y, 1.0, 0.0)).xyz);
}

fn opRepeat(p: vec3<f32>, distance: vec3<f32>) -> vec3<f32> {
    return (p + 0.5 * distance) % distance - 0.5 * distance;
}

const param_min: vec4<f32> = vec4<f32>(-0.8323, -0.694, -0.1045, 0.8067);
const param_max: vec4<f32> = vec4<f32>(0.85, 2.0, 0.9, 0.93);
const FOLDING_NUMBER: u32 = 9;

fn doModel(p_in: vec3<f32>) -> f32 {
    var p = p_in;
    p = opRepeat(p, spaceRepetition);
    var k1: f32;
    var k2: f32;
    var rp2: f32;
    var rq2: f32;
    var scale: f32 = 1.0;
    var orb: f32 = 1e4;
    var q = p;
    for (var i: u32 = 0; i < FOLDING_NUMBER; i = i + 1) {
        p = (1.9 + 0.1 * sin(u.scrollY + 0.5)) * clamp(p, param_min.xyz, param_max.xyz) - p;
        q = 2.0 * fract(0.5 * q + 0.5) - 1.0;
        rp2 = dot(p, p);
        rq2 = dot(q, q);
        k1 = max(param_min.w / rp2, 1.0);
        k2 = max(param_min.w / rq2, 1.0);
        p *= k1;
        q *= k2;
        scale *= k1;
        orb = min(orb, rq2);
    }
    let lxy = length(p.xy);
    return abs(0.5 * max(param_max.w - lxy, lxy * p.z / length(p)) / scale);
}

fn calcNormal(p: vec3<f32>, h: f32) -> vec3<f32> {
    let k = vec2<f32>(1.0, -1.0);
    return normalize(
        k.xyy * doModel(p + k.xyy * h) +
        k.yyx * doModel(p + k.yyx * h) +
        k.yxy * doModel(p + k.yxy * h) +
        k.xxx * doModel(p + k.xxx * h)
    );
}

const minDistance: f32 = 0.03;
const k_val: f32 = 8.0;
const fogNear: f32 = 1.0;
const fogFar: f32 = 100.0;

fn trace(origin: vec3<f32>, direction: vec3<f32>, collision: ptr<function, vec3<f32>>, iterations: ptr<function, u32>, fog: ptr<function, f32>) -> f32 {
    var distanceTraveled: f32 = minDistance;
    var position = origin + minDistance * direction;
    var d: f32 = 0.0;
    var h: f32 = hitThreshold;
    for (var i: u32 = 0; i <= CAMERA_ITERATIONS; i = i + 1) {
        *iterations = i;
        d = doModel(position);
        h = max(hitThreshold * distanceTraveled * distanceTraveled, hitThreshold);
        if (d < h) { break; }
        position += d * direction;
        distanceTraveled += d;
        if (distanceTraveled > fogFar) { break; }
    }
    let iterationFog = f32(*iterations) / f32(CAMERA_ITERATIONS);
    *fog = max(iterationFog, (distance(position, origin) - fogNear) / (fogFar - fogNear));
    if (*iterations == CAMERA_ITERATIONS || distanceTraveled > fogFar) {
        *iterations = 0;
        *fog = 1.0;
    }
    *collision = position;
    let n = calcNormal(*collision, h);
    return max(0.0, dot(n, light));
}

fn occlusion(iterations: u32) -> f32 {
    let occlusionLight = 1.0 - f32(iterations) / f32(CAMERA_ITERATIONS);
    return occlusionLight;
}

@fragment
fn main(@location(0) uv: vec2<f32>, @builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let direction = rotmat_fn() * getRay(fragCoord);

    var iterations: u32;
    var collision: vec3<f32>;
    var fog: f32;
    let lightStrength = trace(rotmat_fn() * (u.cameraPosition * 2.0) + vec3<f32>(1.4, 9.6, 1.1), direction, &collision, &iterations, &fog);

    let normal = calcNormal(collision, hitThreshold);
    let fogColor = vec3<f32>(0.1922, 0.2353, 0.4902);

    let ol: f32 = 0.25;
    return vec4<f32>(
        sqrt(distance(light, collision) / 10.0) * mix(vec3<f32>(occlusion(iterations) * (2.0 - ol) * lightStrength), 2.0 * fogColor, fog),
        1.0
    );
}
