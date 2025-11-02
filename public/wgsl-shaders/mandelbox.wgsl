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

const hitThreshold: f32 = 0.0005;
const CAMERA_ITERATIONS: u32 = 140;
const LIGHT_ITERATIONS: u32 = 60;
const spaceRepetition: vec3<f32> = vec3<f32>(12.0);

fn getRay(fragCoord: vec4<f32>) -> vec3<f32> {
    let normalizedCoords = fragCoord.xy - vec2<f32>(0.5) + (u.offset / u.repeat);
    let pixel = (normalizedCoords - 0.5 * u.screenSize) / min(u.screenSize.x, u.screenSize.y);
    return (u.cameraDirection * normalize(vec4<f32>(pixel.x, pixel.y, 1.0, 0.0))).xyz;
}

fn opRepeat(p: vec3<f32>, distance: vec3<f32>) -> vec3<f32> {
    return (p + 0.5 * distance) % distance - 0.5 * distance;
}

const fixed_radius2: f32 = 5.5;
const min_radius2: f32 = 0.5;

fn sphere_fold(p: ptr<function, vec3<f32>>, dp: ptr<function, f32>) {
    let r2 = dot(*p, *p);
    if (r2 < min_radius2) {
        let temp = (fixed_radius2 / min_radius2);
        *p *= temp;
        *dp *= temp;
    } else if (r2 < fixed_radius2) {
        let temp = (fixed_radius2 / r2);
        *p *= temp;
        *dp *= temp;
    }
}

fn box_fold(p: ptr<function, vec3<f32>>, dp: ptr<function, f32>) {
    *p = clamp(*p, -u.scrollY * 0.8 - 1.5, u.scrollY * 0.8 + 1.5) * 2.0 - *p;
}

fn mandelbox(p_in: vec3<f32>) -> f32 {
    var p = p_in;
    var dr: f32 = 1.0;
    let offset_val = p;
    for (var n: u32 = 0; n < 10; n = n + 1) {
        sphere_fold(&p, &dr);
        box_fold(&p, &dr);
        p = 4.0 * p + offset_val;
        dr = dr * abs(4.0) + 1.0;
        // offset = vec3( 0.1 - sin(scrollY) * cos(scrollY) * 0.1) ;
    }
    let r = length(p);
    return r / abs(dr);
}

fn doModel(p: vec3<f32>) -> f32 {
    return mandelbox(opRepeat(p, vec3<f32>(10.0, 0.0, 10.0)));
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
        if (distanceTraveled > 20.0) { break; } // fogFar
    }
    *fog = max(0.0, (distance(position, origin) - 10.0) / (20.0 - 10.0)); // fogNear, fogFar
    if (*iterations == CAMERA_ITERATIONS || distanceTraveled > 20.0) { // fogFar
        *iterations = 0;
        *fog = 1.0;
        return dot(direction, normalize(vec3<f32>(sin(u.scrollX), 3.0, cos(u.scrollX))));
    }
    *collision = position;
    let n = calcNormal(*collision, h);
    var t: f32 = 15.0 * hitThreshold; // mint
    var res: f32 = 1.0;
    var pd: f32 = 1e1;
    for (var i: u32 = 0; i < LIGHT_ITERATIONS; i = i + 1) {
        position = *collision + (normalize(vec3<f32>(sin(u.scrollX), 3.0, cos(u.scrollX)))) * t;
        d = doModel(position);
        if (d < hitThreshold) {
            return 0.0;
        }
        if (t > 1.0) { // maxt
            res = 1.0;
            break;
        }
        let y = d * d / (2.0 * pd);
        let h_light = sqrt(d * d - y * y);
        res = min(res, 8.0 * h_light / max(0.0, t - y)); // k
        pd = d;
        t += d;
    }
    return max(0.0, res * dot(n, normalize(vec3<f32>(sin(u.scrollX), 3.0, cos(u.scrollX)))));
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
    let direction = getRay(fragCoord);

    var iterations: u32;
    var collision: vec3<f32>;
    var fog: f32;
    let lightStrength = trace(u.cameraPosition * 10.0 + vec3<f32>(0.0, 2.0, 7.7), direction, &collision, &iterations, &fog);

    let fogColor = dot(direction, normalize(vec3<f32>(sin(u.scrollX), 3.0, cos(u.scrollX))));

    let ol: f32 = 0.25;
    return vec4<f32>(
        vec3<f32>((ol * occlusion(iterations) + (1.0 - ol) * lightStrength) * (1.0 - fog) + fog * fogColor),
        1.0
    );
}
