precision highp float;
uniform vec2 screenSize;
uniform vec2 offset;
uniform vec2 repeat;
uniform float time;
uniform vec3 cameraPosition;
uniform mat4 cameraDirection;
uniform bool onlyDistance;
uniform float scrollX;
uniform float scrollY;

const float hitThreshold = 0.00003;

const int CAMERA_ITERATIONS = 240;
const int LIGHT_ITERATIONS= 0;

const float theta = 0.5 * 3.14;
// rotation matrix used to rotate the scene 90deg around x axis
const mat3 xAxis = mat3(
    1, 0, 0,
    0, cos(theta), -sin(theta),
    0, sin(theta), cos(theta)
);

// and one for rotating 90deg around y axis
const mat3 yAxis = mat3(
    cos(theta), 0, sin(theta),
    0, 1, 0,
    -sin(theta), 0, cos(theta)
);

const mat3 rotmat = xAxis * yAxis;

vec3 getRay(vec2 xy) {
    vec2 normalizedCoords = xy - vec2(0.5) + (offset / repeat);
    vec2 pixel = (normalizedCoords - 0.5 * screenSize) / min(screenSize.x, screenSize.y);

    // normalize to get unit vector
    return normalize((cameraDirection * vec4(pixel.x, pixel.y, 1, 0)).xyz);
}




/**
 * @file MengerMushroom.glsl
 *
 * @brief This shader targets to achieve a mathematical render of Menger's Mushroom, a fractal based on the more
 * famous Menger's Sponge, a generalization to higher dimensions of Sierpinski's Carpet.
 *
 * @author Pedro Schneider <pedrotrschneider@gmail.com>
 *
 * @date 06/2020
 *
 * Direct link to ShaderToy: https://www.shadertoy.com/view/dlGBWt
*/

#define MaximumRaySteps 100
#define MaximumDistance 100000000000000000000000000000.
#define MinimumDistance .01
#define PI 3.141592653589793238

// --------------------------------------------------------------------------------------------//
// SDF FUNCTIONS //

// Sphere
// s: radius
float SignedDistSphere (vec3 p, float s) {
  return length (p) - s;
}

// Box
// b: size of box in x/y/z
float SignedDistBox (vec3 p, vec3 b) {
  vec3 d = abs (p) - b;
  return min (max (d.x, max (d.y, d.z)), 0.0) + length (max (d, 0.0));
}

// (Infinite) Plane
// n.xyz: normal of the plane (normalized)
// n.w: offset from origin
float SignedDistPlane (vec3 p, vec4 n) {
  return dot (p, n.xyz) + n.w;
}

// Rounded box
// r: radius of the rounded edges
float SignedDistRoundBox (in vec3 p, in vec3 b, in float r) {
  vec3 q = abs (p) - b;
  return min (max (q.x, max (q.y, q.z)), 0.0) + length (max (q, 0.0)) - r;
}

// BOOLEAN OPERATORS //

// Union
// d1: signed distance to shape 1
// d2: signed distance to shape 2
float opU (float d1, float d2) {
  return (d1 < d2) ? d1 : d2;
}

// Subtraction
// d1: signed distance to shape 1
// d2: signed distance to shape 2
vec4 opS (vec4 d1, vec4 d2) {
  return (-d1.w > d2.w) ? -d1 : d2;
}

// Intersection
// d1: signed distance to shape 1
// d2: signed distance to shape 2
vec4 opI (vec4 d1, vec4 d2) {
  return (d1.w > d2.w) ? d1 : d2;
}

// Mod Position Axis
float pMod1 (inout float p, float size) {
  float halfsize = size * 0.5;
  float c = floor ((p + halfsize) / size);
  p = mod (p + halfsize, size) - halfsize;
  p = mod (-p + halfsize, size) - halfsize;
  return c;
}

// SMOOTH BOOLEAN OPERATORS //

// Smooth Union
// d1: signed distance to shape 1
// d2: signed distance to shape 2
// k: smoothness value for the trasition
float opUS (float d1, float d2, float k) {
  float h = clamp (0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
  float dist = mix (d2, d1, h) - k * h * (1.0 - h);

  return dist;
}

// Smooth Subtraction
// d1: signed distance to shape 1
// d2: signed distance to shape 2
// k: smoothness value for the trasition
vec4 opSS (vec4 d1, vec4 d2, float k) {
  float h = clamp (0.5 - 0.5 * (d2.w + d1.w) / k, 0.0, 1.0);
  float dist = mix (d2.w, -d1.w, h) + k * h * (1.0 - h);
  vec3 color = mix (d2.rgb, d1.rgb, h);

  return vec4 (color.rgb, dist);
}

// Smooth Intersection
// d1: signed distance to shape 1
// d2: signed distance to shape 2
// k: smoothness value for the trasition
vec4 opIS (vec4 d1, vec4 d2, float k) {
  float h = clamp (0.5 - 0.5 * (d2.w - d1.w) / k, 0.0, 1.0);
  float dist = mix (d2.w, d1.w, h) + k * h * (1.0 - h);
  vec3 color = mix (d2.rgb, d1.rgb, h);

  return vec4 (color.rgb, dist);
}

// TRANSFORM FUNCTIONS //

mat2 Rotate (float angle) {
  float s = sin (angle);
  float c = cos (angle);

  return mat2 (c, -s, s, c);
}

vec3 R (vec2 uv, vec3 p, vec3 l, float z) {
  vec3 f = normalize (l - p),
    r = normalize (cross (vec3 (0, 1, 0), f)),
    u = cross (f, r),
    c = p + f * z,
    i = c + uv.x * r + uv.y * u,
    d = normalize (i - p);
  return d;
}

// --------------------------------------------------------------------------------------------//
vec3 hsv2rgb (vec3 c) {
  vec4 K = vec4 (1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs (fract (c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix (K.xxx, clamp (p - K.xxx, 0.0, 1.0), c.y);
}

float map (float value, float min1, float max1, float min2, float max2) {
  return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
}

const float iterations = 25.0;
float sierpinski3 (vec3 z) {
  float Scale = 2.0 + (sin (time / 5.0) + 1.0);
  vec3 Offset = 3.0 * vec3 (1.0, 1.0, 1.0);
  float bailout = 1000.0;

  float r = length (z);
  int n = 0;
  for (int n = 0; n < int(iterations); n++) {
    if (r >= bailout) break;
    //z.yz *= Rotate (map (sin (time / 2.0), -1.0, 1.0, 0.0, 2.0) * PI);
    z.yx *= Rotate (sin (time / 5.0));
    //z.yx *= Rotate (0.436332);
    //z.yx *= Rotate (PI / 10.0);
    //z.xz *= Rotate(map(sin(time / 2.0), -1.0, 1.0, 0.0, 2.0) * PI);

    z.x = abs (z.x);
    z.y = abs (z.y);
    z.z = abs (z.z);

    if (z.x - z.y < 0.0) z.xy = z.yx; // fold 1
    if (z.x - z.z < 0.0) z.xz = z.zx; // fold 2
    if (z.y - z.z < 0.0) z.zy = z.yz; // fold 3

    z.yz *= Rotate (sin (time / 2.0) / 2.0);
    //z.yx *= Rotate (sin (time / 2.0) / 5.0);
    //z.yx *= Rotate(-map(mouse.x, -1.0, 1.0, 0.0, 2.0));
    //z.xz *= Rotate (0.4336332 + 0.02 * time);
    //z.yx *= Rotate (PI / 10.0);
    z.xz *= Rotate (sin (time / 2.0) / 5.0);

    z.x = z.x * Scale - Offset.x * (Scale - 1.0);
    z.y = z.y * Scale - Offset.y * (Scale - 1.0);
    z.z = z.z * Scale;

    if (z.z > 0.5 * Offset.z * (Scale - 1.0)) {
      z.z -= Offset.z * (Scale - 1.0);
    }

    r = length (z);
  }

  return (length (z) - 2.0) * pow (Scale, -float (n));
}

// Calculates de distance from a position p to the scene
float DistanceEstimator (vec3 p) {
  p.yz *= Rotate (0.2 * PI);
  p.yx *= Rotate (0.3 * PI);
  p.xz *= Rotate (0.29 * PI);
  float sierpinski = sierpinski3 (p);
  return sierpinski;
}







// renderer







vec3 calcNormal(vec3 p, float h) {
    const vec2 k = vec2(1,-1);
    return normalize( k.xyy*DistanceEstimator( p + k.xyy*h ) + 
                      k.yyx*DistanceEstimator( p + k.yyx*h ) + 
                      k.yxy*DistanceEstimator( p + k.yxy*h ) + 
                      k.xxx*DistanceEstimator( p + k.xxx*h ) );
}

// xyz -> xzy -> zxy

vec3 light = rotmat * normalize(vec3(sin(scrollX - 1.6), 3, -cos(scrollX)));
const float minDistance = 0.03;
const float k = 8.;
const float fogNear = 1.;
const float fogFar = 100.;
// this is kinda contrived and does a bunch of stuff I'm not using right now, but I'll leave it like this for now
float trace(vec3 origin, vec3 direction, out vec3 collision, out int iterations, out float fog) {
    float distanceTraveled = minDistance;
    vec3 position = origin + minDistance * direction;
    float d = 0.;
    float h = hitThreshold;
    for(int i = 0; i <= CAMERA_ITERATIONS; i++) {
        iterations = i;
        d = DistanceEstimator(position);
        h = max(hitThreshold * distanceTraveled * distanceTraveled, hitThreshold);
        if (d < h) break;
        position += d * direction;
        distanceTraveled += d;
        if (distanceTraveled > fogFar) break;
    }
    float iterationFog = float(iterations) / float(CAMERA_ITERATIONS);
    fog = max(iterationFog, (distance(position, origin) - fogNear) / (fogFar - fogNear));
    if (iterations == CAMERA_ITERATIONS || distanceTraveled > fogFar) {
        iterations = 0;
        fog = 1.;
    }
    collision = position;
    vec3 n = calcNormal(collision, h);
    return max(0., dot(n, light));
}

float occlusion(int iterations) {
    float occlusionLight = 1. - float(iterations) / float(CAMERA_ITERATIONS);
    return occlusionLight;
}

vec3 a = vec3(.5, 0.5, 0.7); // ambient
vec3 b = vec3(.5, .5, .9); // base color
vec3 c = vec3(1., .5, 0.5); // color frequency
vec3 d = vec3(1., 1., 1.); // color phase
vec3 color(in float t)
{
    return a + b * cos(6.28318 * (c * t + d));
}

void main() {
    vec3 direction = rotmat * getRay(gl_FragCoord.xy);

    int iterations;
    vec3 collision;
    float fog;
    float lightStrength = trace(rotmat * (cameraPosition * 2.) + vec3(1.4, 9.6, 1.1), direction, collision, iterations, fog);


    vec3 normal = calcNormal(collision, hitThreshold);
    vec3 fogColor = vec3(0.1922, 0.2353, 0.4902);

    float d = distance(collision, cameraPosition);
    gl_FragColor = vec4(
        d/ 1000.,
        0,0,
        1.
    );
    float ol = .25;
    // gl_FragColor = vec4(
    //     sqrt(distance(light, collision) / 10.) * mix(vec3(occlusion(iterations) * (2. - ol) * lightStrength), 2. * fogColor, fog),
    //     1.
    // );
    // gl_FragColor = vec4(vec3(fog), 1.);
}
