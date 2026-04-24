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
const CAMERA_ITERATIONS: u32 = 200;
const LIGHT_ITERATIONS: u32 = 100;
const spaceRepetition: vec3<f32> = vec3<f32>(12.0, 5.15, 6.0);
const theta: f32 = 0.5 * 3.14;

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

fn rot(a: f32) -> mat2x2<f32> {
    return mat2x2<f32>(vec2<f32>(cos(a), sin(a)), vec2<f32>(-sin(a), cos(a)));
}

fn formula(p_in: vec4<f32>) -> vec4<f32> {
    var p = p_in;
    p.xz = abs(p.xz + 1.0) - abs(p.xz - 1.0) - p.xz;
    p.y -= 0.25;
    p.xy = rot(radians(35.0)) * p.xy;
    p = p * 2.0 / clamp(dot(p.xyz, p.xyz), 0.2, 1.0);
    return p;
}

fn doModel(pos_in: vec3<f32>) -> f32 {
    var hid: f32 = 0.0;
    var tpos = pos_in;
    tpos.z = abs(3.0 - tpos.z % 6.0);
    var p = vec4<f32>(tpos, 1.0);
    for (var i: u32 = 0; i < 4; i = i + 1) { p = formula(p); }
    let fr = (length(max(vec2<f32>(0.0), p.yz - 1.5)) - 1.0) / p.w;
    var ro = max(abs(pos_in.x + 1.0) - 0.3, pos_in.y - 0.35);
    ro = max(ro, -max(abs(pos_in.x + 1.0) - 0.1, pos_in.y - 0.5));
    var pos_z = abs(0.25 - pos_in.z % 0.5);
    ro = max(ro, -max(abs(pos_z) - 0.2, pos_in.y - 0.3));
    ro = max(ro, -max(abs(pos_z) - 0.01, -pos_in.y + 0.32));
    let d = min(fr, ro);
    return d;
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
    let n = calcNormal(*collision, h);
    var t: f32 = 20.0 * hitThreshold; // mint
    var res: f32 = 1.0;
    var pd: f32 = 1e1;
    for (var i: u32 = 0; i < LIGHT_ITERATIONS; i = i + 1) {
        position = *collision + (rotmat_fn() * normalize(vec3<f32>(sin(u.scrollX - 1.6), 3.0, cos(u.scrollX)))) * t;
        d = doModel(position);
        if (d < hitThreshold) {
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

fn hsl2rgb(c: vec3<f32>) -> vec3<f32> {
    let K = vec4<f32>(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    let p = abs(((c.xxx + K.xyz) % 6.0) - K.www);
    return c.z + c.y * (p - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
}

fn getColor(it: f32, d: f32) -> vec3<f32> {
    return hsl2rgb(vec3<f32>(
        d,
        0.6,
        pow(it, 0.8)
    ));
}

@fragment
fn main(@location(0) uv: vec2<f32>, @builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let direction = rotmat_fn() * getRay(fragCoord);
    let light = rotmat_fn() * normalize(vec3<f32>(sin(u.scrollX - 1.6), 3.0, cos(u.scrollX)));

    var iterations: u32;
    var collision: vec3<f32>;
    var fog: f32;
    let lightStrength = trace(rotmat_fn() * (u.cameraPosition) + vec3<f32>(-1.0, 0.7, 0.0), direction, &collision, &iterations, &fog);

    let fogColor = vec3<f32>(dot(direction, light));

    let normal = calcNormal(collision, hitThreshold);

    let ol: f32 = 0.5;
    let c = getColor(normal.x * normal.y * normal.z, 0.0); // d is not used in original, so passing 0.0
    var f = mix(vec3<f32>(pow(occlusion(iterations) + lightStrength, 2.0)) * 0.5, fogColor, fog);
    return vec4<f32>(
        f * 1.0,
        1.0
    );
}
