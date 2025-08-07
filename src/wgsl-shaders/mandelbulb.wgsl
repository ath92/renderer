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
    fov: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

const hitThreshold: f32 = 0.00015;
const MAX_ITER: u32 = 200;
const spaceRepetition: vec3<f32> = vec3<f32>(3.5);

fn getRay(fragCoord: vec4<f32>) -> vec3<f32> {
    let normalizedCoords = fragCoord.xy - vec2<f32>(0.5) + (u.offset / u.repeat);
    let pixel = (normalizedCoords - 0.5 * u.screenSize) / min(u.screenSize.x, u.screenSize.y);
    
    // Calculate focal length from FOV
    let fovRadians = u.fov * 3.14159265359 / 180.0;
    let focalLength = 1.0 / tan(fovRadians * 0.5);
    
    return (u.cameraDirection * normalize(vec4<f32>(pixel.x, pixel.y, focalLength, 0.0))).xyz;
}

fn opRepeat(p: vec3<f32>, distance: vec3<f32>) -> vec3<f32> {
    return (p + 0.5 * distance) % distance - 0.5 * distance;
}

fn doModel(p_in: vec3<f32>) -> f32 {
    let pos = opRepeat(p_in, spaceRepetition);
    var z = pos;
    var dr: f32 = 1.0;
    var r: f32 = 0.0;
    for (var i: u32 = 0; i < 10; i = i + 1) {
        r = length(z);
        if (r > 4.0) { break; }

        // convert to polar coordinates
        let theta = acos(z.z / r);
        let phi = atan2(z.y, z.x);
        let power = 12.0 + sin(u.scrollY) * 10.0;
        dr = pow(r, power - 1.0) * power * dr + 1.5;

        // scale and rotate the point
        let zr = pow(r, power);
        let new_theta = theta * power;
        let new_phi = phi * power;

        // convert back to cartesian coordinates
        z = zr * vec3<f32>(sin(new_theta) * cos(new_phi), sin(new_phi) * sin(new_theta), cos(new_theta));
        z += pos;
    }
    return abs(0.5 * log(r) * r / dr);
}

fn trace(origin: vec3<f32>, direction_in: vec3<f32>, iterations: ptr<function, u32>) -> vec3<f32> {
    var position = origin;
    var distanceTraveled: f32 = 0.0;
    var direction = direction_in;
    let scrollXRotate = mat3x3<f32>(
        vec3<f32>(1.0, sin(u.scrollX) * 0.05, 0.0),
        vec3<f32>(-sin(u.scrollX) * 0.05, 1.0, 0.0),
        vec3<f32>(0.0, 0.0, 1.0)
    );
    for (var i: u32 = 0; i < MAX_ITER; i = i + 1) {
        *iterations = i;
        let d = doModel(position);
        if (d < hitThreshold * distanceTraveled) { break; }
        position += d * direction;
        direction = scrollXRotate * direction;
        distanceTraveled += d;
    }
    return position;
}

fn getIllumination(collision: vec3<f32>, iterations: u32) -> f32 {
    let occlusionLight = 1.0 - f32(iterations) / f32(MAX_ITER);
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
        0.5,
        1.0 - pow(it, 0.8)
    ));
}

@fragment
fn main(@location(0) uv: vec2<f32>, @builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let direction = getRay(fragCoord);

    var iterations: u32;
    let collision = trace(u.cameraPosition, direction, &iterations);
    return vec4<f32>(
        getColor(f32(iterations) / f32(MAX_ITER), distance(collision, spaceRepetition / 2.0)),
        1.0
    );
}
