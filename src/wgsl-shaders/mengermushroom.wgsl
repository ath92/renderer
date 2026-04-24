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
    onlyDistance: u32,
    scrollX: f32,
    scrollY: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

const hitThreshold: f32 = 0.00003;
const CAMERA_ITERATIONS: u32 = 240;
const LIGHT_ITERATIONS: u32 = 0;
const theta: f32 = 0.5 * 3.14;

fn xAxis_fn() -> mat3x3<f32> {
    return mat3x3<f32>(
        vec3<f32>(1.0, 0.0, 0.0),
        vec3<f32>(0.0, cos(theta), -sin(theta)),
        vec3<f32>(0.0, sin(theta), cos(theta))
    );
}

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

// SDF FUNCTIONS //
fn SignedDistSphere(p: vec3<f32>, s: f32) -> f32 {
    return length(p) - s;
}

fn SignedDistBox(p: vec3<f32>, b: vec3<f32>) -> f32 {
    let d = abs(p) - b;
    return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, vec3<f32>(0.0)));
}

fn SignedDistPlane(p: vec3<f32>, n: vec4<f32>) -> f32 {
    return dot(p, n.xyz) + n.w;
}

fn SignedDistRoundBox(p: vec3<f32>, b: vec3<f32>, r: f32) -> f32 {
    let q = abs(p) - b;
    return min(max(q.x, max(q.y, q.z)), 0.0) + length(max(q, vec3<f32>(0.0))) - r;
}

// BOOLEAN OPERATORS //
fn opU(d1: f32, d2: f32) -> f32 {
    return select(d2, d1, d1 < d2);
}

// This function is not directly used in the original GLSL, but is part of the provided SDF functions.
// fn opS(d1: vec4<f32>, d2: vec4<f32>) -> vec4<f32> {
//     return select(-d1, d2, -d1.w > d2.w);
// }

// This function is not directly used in the original GLSL, but is part of the provided SDF functions.
// fn opI(d1: vec4<f32>, d2: vec4<f32>) -> vec4<f32> {
//     return select(d2, d1, d1.w > d2.w);
// }

fn pMod1(p: ptr<function, f32>, size: f32) -> f32 {
    let halfsize = size * 0.5;
    let c = floor((*p + halfsize) / size);
    *p = (*p + halfsize) % size - halfsize;
    *p = (-*p + halfsize) % size - halfsize;
    return c;
}

// SMOOTH BOOLEAN OPERATORS //
fn opUS(d1: f32, d2: f32, k: f32) -> f32 {
    let h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
    return mix(d2, d1, h) - k * h * (1.0 - h);
}

// These functions are not directly used in the original GLSL, but are part of the provided SDF functions.
// fn opSS(d1: vec4<f32>, d2: vec4<f32>, k: f32) -> vec4<f32> {
//     let h = clamp(0.5 - 0.5 * (d2.w + d1.w) / k, 0.0, 1.0);
//     let dist = mix(d2.w, -d1.w, h) + k * h * (1.0 - h);
//     let color = mix(d2.rgb, d1.rgb, h);
//     return vec4<f32>(color.rgb, dist);
// }

// fn opIS(d1: vec4<f32>, d2: vec4<f32>, k: f32) -> vec4<f32> {
//     let h = clamp(0.5 - 0.5 * (d2.w - d1.w) / k, 0.0, 1.0);
//     let dist = mix(d2.w, d1.w, h) + k * h * (1.0 - h);
//     let color = mix(d2.rgb, d1.rgb, h);
//     return vec4<f32>(color.rgb, dist);
// }

// TRANSFORM FUNCTIONS //
fn Rotate(angle: f32) -> mat2x2<f32> {
    let s = sin(angle);
    let c = cos(angle);
    return mat2x2<f32>(vec2<f32>(c, -s), vec2<f32>(s, c));
}

fn map(value: f32, min1: f32, max1: f32, min2: f32, max2: f32) -> f32 {
    return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
}

const iterations_sierpinski: f32 = 25.0;
fn sierpinski3(z_in: vec3<f32>) -> f32 {
    var z = z_in;
    let Scale = 2.0 + (sin(u.time / 5.0) + 1.0);
    let Offset = 3.0 * vec3<f32>(1.0, 1.0, 1.0);
    let bailout = 1000.0;

    var r = length(z);
    var n: u32 = 0;
    for (n = 0; n < u32(iterations_sierpinski); n = n + 1) {
        if (r >= bailout) { break; }
        z.yx = (Rotate(sin(u.time / 5.0)) * z.yx);

        z.x = abs(z.x);
        z.y = abs(z.y);
        z.z = abs(z.z);

        if (z.x - z.y < 0.0) { z.xy = z.yx; } // fold 1
        if (z.x - z.z < 0.0) { z.xz = z.zx; } // fold 2
        if (z.y - z.z < 0.0) { z.zy = z.yz; } // fold 3

        z.yz = (Rotate(sin(u.time / 2.0) / 2.0) * z.yz);
        z.xz = (Rotate(sin(u.time / 2.0) / 5.0) * z.xz);

        z.x = z.x * Scale - Offset.x * (Scale - 1.0);
        z.y = z.y * Scale - Offset.y * (Scale - 1.0);
        z.z = z.z * Scale;

        if (z.z > 0.5 * Offset.z * (Scale - 1.0)) {
            z.z -= Offset.z * (Scale - 1.0);
        }

        r = length(z);
    }

    return (length(z) - 2.0) * pow(Scale, -f32(n));
}

fn DistanceEstimator(p: vec3<f32>) -> f32 {
    var p_mut = p;
    p_mut.yz = (Rotate(0.2 * 3.141592653589793238) * p_mut.yz);
    p_mut.yx = (Rotate(0.3 * 3.141592653589793238) * p_mut.yx);
    p_mut.xz = (Rotate(0.29 * 3.141592653589793238) * p_mut.xz);
    let sierpinski = sierpinski3(p_mut);
    return sierpinski;
}

fn calcNormal(p: vec3<f32>, h: f32) -> vec3<f32> {
    let k = vec2<f32>(1.0, -1.0);
    return normalize(
        k.xyy * DistanceEstimator(p + k.xyy * h) +
        k.yyx * DistanceEstimator(p + k.yyx * h) +
        k.yxy * DistanceEstimator(p + k.yxy * h) +
        k.xxx * DistanceEstimator(p + k.xxx * h)
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
        d = DistanceEstimator(position);
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
    return max(0.0, dot(n, rotmat_fn() * normalize(vec3<f32>(sin(u.scrollX - 1.6), 3.0, -cos(u.scrollX)))));
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

    let d = distance(collision, u.cameraPosition);
    return vec4<f32>(
        d / 1000.0,
        0.0, 0.0,
        1.0
    );
}
