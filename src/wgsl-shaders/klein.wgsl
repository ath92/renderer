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
const CAMERA_ITERATIONS: u32 = 400;
const LIGHT_ITERATIONS: u32 = 100;
const spaceRepetition: vec3<f32> = vec3<f32>(12.0, 5.15, 6.0);
const theta: f32 = 0.5 * 3.14;

// rotation matrix used to rotate the scene 90deg around x axis
fn rotmat_fn() -> mat3x3<f32> {
    return mat3x3<f32>(
        vec3<f32>(1.0, 0.0, 0.0),
        vec3<f32>(0.0, cos(theta), -sin(theta)),
        vec3<f32>(0.0, sin(theta), cos(theta))
    );
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

fn trace(origin: vec3<f32>, direction: vec3<f32>, collision: ptr<function, vec3<f32>>, iterations: ptr<function, u32>, fog: ptr<function, f32>) -> f32 {
    var position = origin;
    var distanceTraveled: f32 = 0.0;
    var d: f32 = 0.0;
    var h: f32 = hitThreshold;
    for (var i: u32 = 0; i <= CAMERA_ITERATIONS; i = i + 1) {
        *iterations = i;
        d = doModel(position);
        h = max(hitThreshold * distanceTraveled, hitThreshold / 20.0);
        if (d < h) { break; }
        position += d * direction;
        distanceTraveled += d;
        if (distanceTraveled > 200.0) { break; } // fogFar
    }
    *fog = max(0.0, (distance(position, origin) - 1.0) / (200.0 - 1.0)); // fogNear, fogFar
    if (*iterations == CAMERA_ITERATIONS || distanceTraveled > 200.0) { // fogFar
        *iterations = 0;
        *fog = 1.0;
        return dot(direction, rotmat_fn() * normalize(vec3<f32>(sin(u.scrollX - 1.6), 3.0, cos(u.scrollX))));
    }
    *collision = position;
    let n = calcNormal(*collision, h * distanceTraveled);
    var t: f32 = 20.0 * hitThreshold; // mint
    var res: f32 = 1.0;
    var pd: f32 = 1e1;
    for (var i: u32 = 0; i < LIGHT_ITERATIONS; i = i + 1) {
        position = *collision + (rotmat_fn() * normalize(vec3<f32>(sin(u.scrollX - 1.6), 3.0, cos(u.scrollX)))) * t;
        d = doModel(position);
        if (d < hitThreshold * distanceTraveled) {
            return 0.0;
        }
        if (t > 0.5) { // maxt
            res = pow(1.0 - f32(i) / f32(LIGHT_ITERATIONS), 3.0);
            break;
        }
        let y = d * d / (2.0 * pd);
        let h_light = sqrt(d * d - y * y);
        res = min(res, 8.0 * h_light / max(0.0, t - y)); // k
        pd = d;
        t += d;
    }
    return max(0.0, res);
}

fn occlusion(iterations: u32) -> f32 {
    let occlusionLight = 1.0 - f32(iterations) / f32(CAMERA_ITERATIONS);
    return occlusionLight;
}

@fragment
fn main(@location(0) uv: vec2<f32>, @builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let yellow = vec3<f32>(1.0, 0.7, 0.0);
    let up = normalize(rotmat_fn() * vec3<f32>(1.0, 1.0, 0.5));
    let light = rotmat_fn() * normalize(vec3<f32>(sin(u.scrollX - 1.6), 3.0, cos(u.scrollX)));

    let direction = rotmat_fn() * getRay(fragCoord);

    var iterations: u32;
    var collision: vec3<f32>;
    var fog: f32;
    let origin = rotmat_fn() * (u.cameraPosition * 2.0) + vec3<f32>(1.4, 9.5, 1.1);
    let lightStrength = trace(origin, direction, &collision, &iterations, &fog);

    let dist = distance(origin, collision);

    let fogColor = vec3<f32>(dot(direction, light));

    let normal = calcNormal(collision, hitThreshold * dist);
    let colorThreshold = dot(normal, up);

    let ol: f32 = 0.5;
    var f = mix(vec3<f32>(pow(occlusion(iterations) + lightStrength, 2.0)) * 0.5, fogColor, fog);

    if (colorThreshold > 0.8) {
        f *= yellow;
    }

    return vec4<f32>(f * 1.0, 1.0);
}
