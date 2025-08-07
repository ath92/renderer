struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

struct Uniforms {
    screenSize: vec2<f32>,
    offset: vec2<f32>,
    repeat: vec2<f32>,
    cameraPosition: vec3<f32>,
    cameraDirection: mat4x4<f32>,
    scrollX: f32,
    scrollY: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

const MAX_ITER: u32 = 128;
const HIT_THRESHOLD: f32 = 0.0001;

fn rotmat_fn() -> mat3x3<f32> {
    return mat3x3<f32>(
        vec3<f32>(1.0, 0.0, 0.0),
        vec3<f32>(0.0, cos(u.scrollX), sin(u.scrollX)),
        vec3<f32>(0.0, -sin(u.scrollX), cos(u.scrollX))
    );
}

fn getRay(fragCoord: vec4<f32>) -> vec3<f32> {
    let normalizedCoords = fragCoord.xy - vec2<f32>(0.5) + (u.offset / u.repeat);
    let pixel = (normalizedCoords - 0.5 * u.screenSize) / min(u.screenSize.x, u.screenSize.y);
    return (u.cameraDirection * normalize(vec4<f32>(pixel.x, pixel.y, 1.0, 0.0))).xyz;
}

fn makeHoles(p: vec3<f32>, h: f32) -> f32 {
    let p_abs = abs(p);
    let p_minus_h = p_abs - h;
    let val1 = max(p_minus_h.z, p_minus_h.y);
    let val2 = max(p_minus_h.x, p_minus_h.z);
    let val3 = max(p_minus_h.x, p_minus_h.y);
    return max(max(-val1, -val2), -val3);
}

fn box(p: vec3<f32>, b: f32) -> f32 {
    let p_abs = abs(p);
    let p_minus_b = p_abs - b;
    return length(max(p_minus_b, vec3<f32>(0.0))) + min(max(p_minus_b.x, max(p_minus_b.y, p_minus_b.z)), 0.0);
}

fn opRepeat(p: vec3<f32>, distance: vec3<f32>) -> vec3<f32> {
    return (p + 0.5 * distance) % distance - 0.5 * distance;
}

const MENGER_ITERATIONS: u32 = 7;
fn menger(p_in: vec3<f32>, b: f32, h_in: f32) -> f32 {
    var p = p_in;
    var h = h_in;
    let box_val = box(p, b);
    var holes = makeHoles(p, h);
    var scale = h;
    for (var i: u32 = 0; i < MENGER_ITERATIONS; i = i + 1) {
        p = rotmat_fn() * p + vec3<f32>(-2.0 * scale, -2.0 * scale, -2.0 * scale);
        holes = max(holes, makeHoles(opRepeat(p, vec3<f32>(2.0 * scale)), h * scale));
        scale = scale * h;
    }
    return max(box_val, holes);
}

fn doModel(p: vec3<f32>) -> f32 {
    return menger(
        opRepeat(p, vec3<f32>(10.0)),
        3.0,
        1.0 / 3.0 + u.scrollY / 10.0
    );
}

fn trace(origin: vec3<f32>, direction: vec3<f32>, iterations: ptr<function, u32>, distanceAtEnd: ptr<function, f32>) -> vec3<f32> {
    var position = origin;
    for (var i: u32 = 0; i < MAX_ITER; i = i + 1) {
        *iterations = i;
        let d = doModel(position);
        let distanceToOrigin = distance(position, origin);
        if (d < HIT_THRESHOLD * distanceToOrigin) {
            *distanceAtEnd = d;
            break;
        }
        position += d * direction;
    }
    return position;
}

fn getIllumination(collision: vec3<f32>, iterations: u32) -> f32 {
    let occlusionLight = 1.0 - f32(iterations) / f32(MAX_ITER);
    return occlusionLight;
}

@fragment
fn main(@location(0) uv: vec2<f32>, @builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let direction = getRay(fragCoord);

    var brightness: f32 = 0.0;
    var iterations: u32;
    var distanceAtEnd: f32 = 0.0;
    let collision = trace(u.cameraPosition * 20.0, direction, &iterations, &distanceAtEnd);
    if (iterations < MAX_ITER - 1) { // actual collision
        brightness = getIllumination(collision, iterations);
    } else {
        brightness = min(1.0, 1.0 - distanceAtEnd / 100.0);
    }
    return vec4<f32>(
        brightness,
        brightness,
        brightness,
        1.0
    );
}
