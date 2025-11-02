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

// Function to get the ray direction from fragment coordinates
fn getRay(fragCoord: vec4<f32>) -> vec3<f32> {
    let normalizedCoords = fragCoord.xy - vec2<f32>(0.5) + (u.offset / u.repeat);
    let pixel = (normalizedCoords - 0.5 * u.screenSize) / min(u.screenSize.x, u.screenSize.y);
    // Assuming cameraDirection is a matrix that transforms from camera space to world space
    return normalize((u.cameraDirection * vec4<f32>(pixel.x, pixel.y, 1.0, 0.0)).xyz);
}

// Distance function for a sphere
fn sdSphere(p: vec3<f32>, r: f32) -> f32 {
    return length(p) - r;
}

// Raymarching function
fn raymarch(ro: vec3<f32>, rd: vec3<f32>) -> f32 {
    var t: f32 = 0.0;
    for (var i: u32 = 0; i < 100u; i = i + 1) {
        let p = ro + rd * t;
        let d = sdSphere(p - vec3<f32>(0.0, 0.0, 5.0), 1.0); // Sphere at (0,0,5) with radius 1
        if (d < 0.001 || t > 100.0) { // Hit threshold and max distance
            break;
        }
        t += d;
    }
    return t;
}

@fragment
fn main(@location(0) uv: vec2<f32>, @builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let rayOrigin = u.cameraPosition;
    let rayDirection = getRay(fragCoord);

    let t = raymarch(rayOrigin, rayDirection);

    var color: vec3<f32>;
    if (t < 100.0) { // If hit
        let hitPos = rayOrigin + rayDirection * t;
        let normal = normalize(hitPos - vec3<f32>(0.0, 0.0, 5.0)); // Normal for sphere at (0,0,5)
        let lightDir = normalize(vec3<f32>(0.5, 1.0, -0.5)); // Simple light direction
        let diffuse = max(0.0, dot(normal, lightDir));
        color = vec3<f32>(0.2, 0.7, 0.9) * diffuse; // Blueish sphere
    } else {
        color = vec3<f32>(0.1, 0.1, 0.1); // Background color
    }

    return vec4<f32>(color, 1.0);
}
