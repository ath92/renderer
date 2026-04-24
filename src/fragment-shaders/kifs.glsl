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

const float hitThreshold = 0.001;

const int CAMERA_ITERATIONS = 120;
const int LIGHT_ITERATIONS = 32;

const vec3 spaceRepetition = vec3(24.0);

vec3 getRay(vec2 xy) {
    vec2 normalizedCoords = xy - vec2(0.5) + (offset / repeat);
    vec2 pixel = (normalizedCoords - 0.5 * screenSize) / min(screenSize.x, screenSize.y);

    return normalize((cameraDirection * vec4(pixel.x, pixel.y, 1, 0)).xyz);
}

vec3 opRepeat(vec3 p, vec3 distance) {
    return mod(p + 0.5 * distance, distance) - 0.5 * distance;
}

vec3 rotateX(vec3 p, float a) {
    float s = sin(a);
    float c = cos(a);
    return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
}

vec3 rotateY(vec3 p, float a) {
    float s = sin(a);
    float c = cos(a);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

vec3 rotateZ(vec3 p, float a) {
    float s = sin(a);
    float c = cos(a);
    return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
}

float boxFold(vec3 p, vec3 r) {
    return length(max(abs(p) - r, 0.0));
}

float sphereFold(vec3 p, float r) {
    return length(p) - r;
}

float doModel(vec3 p) {
    p = opRepeat(p, spaceRepetition);
    
    float rotateAmount = scrollY * 0.5 + 0.3;
    float scale = 2.8 + sin(scrollX) * 0.5;
    float dr = 1.0;
    vec3 offset = p;
    
    for (int i = 0; i < 8; i++) {
        p = rotateY(p, rotateAmount);
        p = rotateX(p, rotateAmount * 0.7);
        
        p = clamp(p, -1.0, 1.0) * 2.0 - p;
        
        float planeDist = dot(p, normalize(vec3(1.0, 1.0, 0.0)));
        if (planeDist < 0.0) {
            p -= 2.0 * planeDist * normalize(vec3(1.0, 1.0, 0.0));
        }
        
        p = scale * p + offset;
        dr = dr * abs(scale) + 1.0;
        
        offset = vec3(sin(float(i) * 1.7) * 0.1);
    }
    
    return length(p) / abs(dr);
}

vec3 calcNormal(vec3 p, float h) {
    const vec2 k = vec2(1, -1);
    return normalize(
        k.xyy * doModel(p + k.xyy * h) +
        k.yyx * doModel(p + k.yyx * h) +
        k.yxy * doModel(p + k.yxy * h) +
        k.xxx * doModel(p + k.xxx * h)
    );
}

vec3 light = normalize(vec3(sin(scrollX) * 3.0, 5.0, cos(scrollX) * 3.0));
const float fogNear = 10.0;
const float fogFar = 60.0;
const float mint = 0.01;
const float maxt = 1.5;
const float k = 8.0;

float trace(vec3 origin, vec3 direction, out vec3 collision, out int iterations, out float fog) {
    vec3 position = origin;
    float distanceTraveled = 0.0;
    float d = 0.0;
    float h = hitThreshold;
    
    for (int i = 0; i < CAMERA_ITERATIONS; i++) {
        iterations = i;
        d = doModel(position);
        h = max(hitThreshold * distanceTraveled, hitThreshold);
        if (d < h) break;
        position += d * direction;
        distanceTraveled += d;
        if (distanceTraveled > fogFar) break;
    }
    
    fog = clamp((distanceTraveled - fogNear) / (fogFar - fogNear), 0.0, 1.0);
    
    if (iterations == CAMERA_ITERATIONS || distanceTraveled > fogFar) {
        iterations = 0;
        fog = 1.0;
        return dot(direction, light);
    }
    
    collision = position;
    vec3 n = calcNormal(collision, h);
    
    float t = mint;
    float res = 1.0;
    float pd = 1e1;
    
    for (int i = 0; i < LIGHT_ITERATIONS; i++) {
        position = collision + light * t;
        d = doModel(position);
        if (d < hitThreshold) {
            return 0.0;
        }
        if (t > maxt) {
            res = 1.0;
            break;
        }
        float y = d * d / (2.0 * pd);
        float h_dist = sqrt(d * d - y * y);
        res = min(res, k * h_dist / max(0.01, t - y));
        pd = d;
        t += d;
    }
    
    return max(0.0, res * dot(n, light));
}

vec3 hsl2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
}

vec3 getColor(float it, float d) {
    return hsl2rgb(vec3(
        d * 0.3 + 0.1,
        0.6,
        0.5 + it * 0.5
    ));
}

void main() {
    vec3 direction = getRay(gl_FragCoord.xy);

    int iterations;
    vec3 collision;
    float fog;
    float lightStrength = trace(
        cameraPosition * 8.0 + vec3(0.0, 2.0, 5.0),
        direction,
        collision,
        iterations,
        fog
    );

    vec3 fogColor = vec3(0.15, 0.2, 0.35);
    float occlusion = 1.0 - float(iterations) / float(CAMERA_ITERATIONS);
    
    vec3 col = getColor(float(iterations) / float(CAMERA_ITERATIONS), length(collision) * 0.1);
    float ambient = 0.3;
    col *= (occlusion * 0.5 + 0.5) * (lightStrength + ambient);
    col = mix(col, fogColor, fog);
    
    gl_FragColor = vec4(col * 1.5, 1.0);
}