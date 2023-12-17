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

const int CAMERA_ITERATIONS = 400;
const int LIGHT_ITERATIONS= 100;

const vec3 spaceRepetition = vec3(12, 5.15, 6);

const float theta = 0.5 * 3.14;
// rotation matrix used to rotate the scene 90deg around x axis
const mat3 rotmat = mat3(
    1, 0, 0,
    0, cos(theta), -sin(theta),
    0, sin(theta), cos(theta)
);

vec3 getRay(vec2 xy) {
    vec2 normalizedCoords = xy - vec2(.5) + (offset / repeat);
    vec2 pixel = (normalizedCoords - 0.5 * screenSize) / min(screenSize.x, screenSize.y);

    // normalize to get unit vector
    return normalize((cameraDirection * vec4(pixel.x, pixel.y, 1, 0)).xyz);
}

vec3 opRepeat(vec3 p, vec3 distance) {
    return mod(p + 0.5 * distance, distance) - 0.5 * distance;
}

// see e.g. http://blog.hvidtfeldts.net/index.php/2012/05/distance-estimated-3d-fractals-part-viii-epilogue/
// for more info

const vec4 param_min = vec4(-0.8323, -0.694, -0.1045, 0.8067);
const vec4 param_max = vec4(0.85, 2.0, 0.9, 0.93);
const int FOLDING_NUMBER = 9;
float doModel(vec3 p)
{
    p = opRepeat(p, spaceRepetition);
    float k1, k2, rp2, rq2;
    float scale = 1.0;
    float orb = 1e4;
    vec3 q = p;
    for (int i = 0; i < FOLDING_NUMBER; i++)
	{
        p = (1.9 + .1 * sin(scrollY + .5)) * clamp(p, param_min.xyz, param_max.xyz) - p;
	    q = 2. * fract(0.5 * q + 0.5) - 1.0;
	    rp2 = dot(p, p);
        rq2 = dot(q, q);
	    k1 = max(param_min.w / rp2, 1.0);
        k2 = max(param_min.w / rq2, 1.0);
	    p *= k1;
        q *= k2;
	    scale *= k1;
        orb = min(orb, rq2);
	}
    float lxy = length(p.xy);
    return abs(0.5 * max(param_max.w - lxy, lxy * p.z / length(p)) / scale);
}

vec3 calcNormal(vec3 p, float h) {
    const vec2 k = vec2(1,-1);
    return normalize( k.xyy*doModel( p + k.xyy*h ) + 
                      k.yyx*doModel( p + k.yyx*h ) + 
                      k.yxy*doModel( p + k.yxy*h ) + 
                      k.xxx*doModel( p + k.xxx*h ) );
}

vec3 light = rotmat * normalize(vec3(sin(scrollX - 1.6), 3, cos(scrollX)));
const float minDistance = 0.03;
const float k = 8.;
const float fogNear = 1.;
const float fogFar = 200.;
const float mint = 20. * hitThreshold;
const float maxt = .5;
// this is kinda contrived and does a bunch of stuff I'm not using right now, but I'll leave it like this for now
float trace(vec3 origin, vec3 direction, out vec3 collision, out int iterations, out float fog) {
    vec3 position = origin;
    float distanceTraveled = 0.;
    float d = 0.;
    float h = hitThreshold;
    for(int i = 0; i <= CAMERA_ITERATIONS; i++) {
        iterations = i;
        d = doModel(position);
        h = max(hitThreshold * distanceTraveled, hitThreshold / 20.);
        if (d < h) break;
        position += d * direction;
        distanceTraveled += d;
        if (distanceTraveled > fogFar) break;
    }
    fog = max(0., (distance(position, origin) - fogNear) / (fogFar - fogNear));
    if (iterations == CAMERA_ITERATIONS || distanceTraveled > fogFar) {
        iterations = 0;
        fog = 1.;
        return dot(direction, light);
    }
    collision = position;
    vec3 n = calcNormal(collision, h * distanceTraveled);
    float t = mint;
    float res = 1.0;
    float pd = 1e1;
    for (int i = 0; i < LIGHT_ITERATIONS; i++) {
        position = collision + light * t;
        d = doModel(position);
        if (d < hitThreshold * distanceTraveled){
            return 0.;
            // return (t - mint) / (maxt - mint);
        };
        if (t > maxt) {
            res = pow(1. - float(i) / float(LIGHT_ITERATIONS), 3.);
            break;
        }
        float y = d*d/(2.0*pd);
        float h = sqrt(d*d-y*y);
        res = min( res, k*h/max(0.,t-y) );
        pd = d;
        t += d;
    }
    return max(0., res);
}

float occlusion(int iterations) {
    float occlusionLight = 1. - float(iterations) / float(CAMERA_ITERATIONS);
    return occlusionLight;
}

vec3 yellow = vec3(1, .7, 0);
vec3 up = normalize(rotmat * vec3(1., 1, .5)); // what

void main() {
    vec3 direction = rotmat * getRay(gl_FragCoord.xy);

    int iterations;
    vec3 collision;
    float fog;
    vec3 origin = rotmat * (cameraPosition * 2.) + vec3(1.4, 9.5, 1.1);
    float lightStrength = trace(origin, direction, collision, iterations, fog);

    float dist = distance(origin, collision);

    vec3 fogColor = vec3(dot(direction, light));

    vec3 normal = calcNormal(collision, hitThreshold * dist);
    float colorThreshold = dot(normal, up);

    // float d = distance(collision, cameraPosition);
    float ol = .5;
    vec3 f = mix(vec3(pow(occlusion(iterations) + lightStrength, 2.)) * .5, fogColor , fog);

    if (colorThreshold > 0.8) {
        f *= yellow;
    }

    gl_FragColor = vec4(
        f * 1.,
        1.
    );
    // gl_FragColor = vec4(vec3(fog), 1.);
}
