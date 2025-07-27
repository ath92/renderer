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

struct Node {
    type_op_data1: vec4<f32>, // x: type (0=op, 1=leaf), y: op/scale, z: smoothing/padding, w: padding
    aabb_min: vec4<f32>,      // x,y,z, w: padding
    aabb_max: vec4<f32>,      // x,y,z, w: padding
    tree_indices: vec4<f32>,  // x: entry, y: exit, z: flattenedIndex, w: padding
    model_matrix: mat4x4<f32>, // 16 floats
};

@group(0) @binding(1) var<storage, read> bvh_nodes: array<Node>;


// Result of SDF evaluation including distance
struct SceneSdfResult {
    distance: f32,
    position: vec3<f32>,
    steps: i32,
    normal: vec3<f32>,
}

// Initialize a scene SDF result with default values
fn init_scene_sdf_result(point: vec3<f32>, steps: i32) -> SceneSdfResult {
    var result: SceneSdfResult;
    result.distance = 999999.0; // Large initial distance
    result.position = point;
    result.steps = steps;
    result.normal = vec3<f32>(0.0, 0.0, 0.0);
    return result;
}

// SDF for a sphere
fn sphere_sdf(point: vec3<f32>, center: vec3<f32>, radius: f32) -> f32 {
    return length(point - center) - radius;
}

fn quadratic_smin( a: f32, b: f32, k: f32 ) -> f32
{
    let k4 = k* 4.0;
    let h = max( k4-abs(a-b), 0.0 )/k4;
    return min(a,b) - h*h*k4*(1.0/4.0);
}

fn calculate_normal_bvh(p: vec3<f32>, ray_dir: vec3<f32>) -> vec3<f32> {
    let h: f32 = 0.001; // replace by an appropriate value
    let k: vec2<f32> = vec2<f32>(1.0, -1.0);

    let term1 = k.xyy * evaluate_scene_sdf_bvh_2(p + k.xyy * h, ray_dir, 0).distance;
    let term2 = k.yyx * evaluate_scene_sdf_bvh_2(p + k.yyx * h, ray_dir, 0).distance;
    let term3 = k.yxy * evaluate_scene_sdf_bvh_2(p + k.yxy * h, ray_dir, 0).distance;
    let term4 = k.xxx * evaluate_scene_sdf_bvh_2(p + k.xxx * h, ray_dir, 0).distance;

    return normalize(term1 + term2 + term3 + term4);
}

// Combine a sphere into the existing scene result with smooth blending
fn combine_sphere_into_scene_result(
    current_result: ptr<function, SceneSdfResult>,
    point: vec3<f32>,
    sphere_center: vec3<f32>,
    sphere_radius: f32,
    smoothing_factor: f32,
    is_first: bool
) {
    let sphere_distance = sphere_sdf(point, sphere_center, sphere_radius);

    if (is_first) {
        // First sphere - just use its values
        (*current_result).distance = sphere_distance;
    } else {
        // Combine with existing result using smooth minimum
        (*current_result).distance = quadratic_smin((*current_result).distance, sphere_distance, smoothing_factor);
    }
}

fn ray_aabb_intersection(ray_origin: vec3<f32>, ray_dir: vec3<f32>, aabb_min: vec3<f32>, aabb_max: vec3<f32>) -> bool {
    let inv_dir = 1.0 / ray_dir;
    let tmin = (aabb_min - ray_origin) * inv_dir;
    let tmax = (aabb_max - ray_origin) * inv_dir;

    let t1 = min(tmin, tmax);
    let t2 = max(tmin, tmax);

    let t_near = max(max(t1.x, t1.y), t1.z);
    let t_far = min(min(t2.x, t2.y), t2.z);

    return t_near <= t_far;
}

fn evaluate_scene_sdf_bvh_2(point: vec3<f32>, ray_dir: vec3<f32>, steps: i32) -> SceneSdfResult {
    var sdf_result = init_scene_sdf_result(point, steps);
    let smoothing_factor = 0.1; // Adjust for more/less blending

    var index = 0;
    var processed_any = false;

    var aabb_min_dist = sdf_result.distance;

    // Iterate while the node index is valid (-1 is used for invalid indices)
    while (index >= 0) {
        let node = bvh_nodes[index];
        let node_type = node.type_op_data1.x;

        if (node_type == 1.) { // 1. == leaf node
            let transform = node.model_matrix;

            let sphere_center = transform * vec4(0.,0.,0., 1.);
            let sphere_radius = node.type_op_data1.y;

            combine_sphere_into_scene_result(
                &sdf_result,
                point,
                sphere_center.xyz,
                sphere_radius,
                smoothing_factor,
                !processed_any
            );

            processed_any = true;

            // Exit the current node
            index = i32(node.tree_indices.y);
        } else {
            if (ray_aabb_intersection(point, ray_dir, node.aabb_min.xyz, node.aabb_max.xyz)) {
                // If AABB test passes, proceed to entry_index (go down the tree branch)
                index = i32(node.tree_indices.x);
            } else {
                // If AABB test fails, proceed to exit_index (skip this subtree, proceed to next sibling)
                index = i32(node.tree_indices.y);
            }
        }
    }

    if (!processed_any) {
        sdf_result.distance = aabb_min_dist;
    }

    return sdf_result;
}

struct RaymarchConfig {
    max_steps: i32,
    max_distance: f32,
    surface_threshold: f32,
}

fn raymarch_config() -> RaymarchConfig {
    var config: RaymarchConfig;
    config.max_steps = 100;
    config.max_distance = 100.;
    config.surface_threshold = 0.01;
    return config;
}

// BVH-accelerated raymarching from position
fn raymarch_from_position_bvh_2(start_pos: vec3<f32>, ray_dir: vec3<f32>, config: RaymarchConfig) -> SceneSdfResult {
    var ray_pos = start_pos;
    var total_distance = 0.0;


    // Raymarching loop starting from given position with BVH acceleration
    for (var step = 0; step < config.max_steps; step++) {
        // let sdf_result = evaluate_scene_sdf(ray_pos, step);
        var sdf_result = evaluate_scene_sdf_bvh_2(ray_pos, ray_dir, step);

        // If we're close enough to a surface, we've hit something
        if (sdf_result.distance < config.surface_threshold) {
            // Calculate normal using the same candidate list for consistency
            var result = sdf_result;
            result.normal = calculate_normal_bvh(ray_pos, ray_dir);
            return result;
        }

        // If we've traveled too far, we haven't hit anything
        if (total_distance > config.max_distance) {
            break;
        }

        // March along the ray
        ray_pos += ray_dir * sdf_result.distance;
        total_distance += sdf_result.distance;
    }

    var result: SceneSdfResult;
    result.distance = config.max_distance;
    result.position = ray_pos;
    result.normal = vec3<f32>(0.0, 0.0, 0.0);
    return result;
}

fn get_ray_direction(fragCoord: vec4<f32>) -> vec3<f32> {
    let normalizedCoords = fragCoord.xy - vec2<f32>(0.) + (u.offset / u.repeat);
    let pixel = (normalizedCoords - u.screenSize / 2.) / min(u.screenSize.x, u.screenSize.y);
    return normalize((u.cameraDirection * vec4<f32>(pixel.x, -pixel.y, 1.0, 0.0)).xyz);
}

@fragment
fn main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Setup ray for coarse raymarching
    let uv = in.uv;
    let config = raymarch_config();

    // Ray origin (actual camera position)
    let ray_origin = u.cameraPosition;
    let ray_dir = get_ray_direction(in.position);

    // Perform fine raymarching starting from the coarse position with BVH acceleration
    var result = raymarch_from_position_bvh_2(ray_origin, ray_dir, config);

    if (result.distance < config.max_distance) {
        // Simple lighting calculation using surface normal from raymarch result
        let normal = result.normal;
        let light_dir = cross(ray_dir, normalize(vec3<f32>(-1.0, 1.0, 1.)));
        let diffuse = max(dot(normal, light_dir), 0.1);

        return vec4<f32>(diffuse, diffuse, diffuse, 1.0);
    }

    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
}
