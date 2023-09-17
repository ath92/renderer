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

const int CAMERA_ITERATIONS = 200;
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

// 2D rotation function
mat2 rot(float a) {
	return mat2(cos(a),sin(a),-sin(a),cos(a));	
}

// "Amazing Surface" fractal
vec4 formula(vec4 p) {
		p.xz = abs(p.xz+1.)-abs(p.xz-1.)-p.xz;
		p.y-=.25;
		p.xy*=rot(radians(35.));
		p=p*2./clamp(dot(p.xyz,p.xyz),.2,1.);
	return p;
}

// Distance function
float doModel(vec3 pos) {
	float hid=0.;
	vec3 tpos=pos;
	tpos.z=abs(3.-mod(tpos.z,6.));
	vec4 p=vec4(tpos,1.);
	for (int i=0; i<4; i++) {p=formula(p);}
	float fr=(length(max(vec2(0.),p.yz-1.5))-1.)/p.w;
	float ro=max(abs(pos.x+1.)-.3,pos.y-.35);
		  ro=max(ro,-max(abs(pos.x+1.)-.1,pos.y-.5));
	pos.z=abs(.25-mod(pos.z,.5));
		  ro=max(ro,-max(abs(pos.z)-.2,pos.y-.3));
		  ro=max(ro,-max(abs(pos.z)-.01,-pos.y+.32));
	float d=min(fr,ro);
	return d;
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
    vec3 n = calcNormal(collision, h);
    float t = mint;
    float res = 1.0;
    float pd = 1e1;
    for (int i = 0; i < LIGHT_ITERATIONS; i++) {
        position = collision + light * t;
        d = doModel(position);
        if (d < hitThreshold){
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

// const float col = 0.05; // amount of coloring

vec3 hsl2rgb( in vec3 c ) {
    vec3 rgb = clamp( abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0 );
    return c.z + c.y * (rgb-0.5)*(1.0-abs(2.0*c.z-1.0));
}

vec3 getColor(float it, float d) {
    return hsl2rgb(vec3(
        d,
        0.6,
        pow(it, 0.8)
    ));
}

vec3 a = vec3(0.5, 0.5, 0.7);
vec3 b = vec3(0.5, 0.5, 1.0);
vec3 c =   vec3(6.0, 1.0, 0.0);
vec3 d = vec3(1.1, 1.0, 1.);
vec3 color(in float t)
{
    return a + b * cos(6.28318 * (c * t + d));
}

float blendLighten(float base, float blend) {
	return max(blend,base);
}


void main() {
    vec3 direction = rotmat * getRay(gl_FragCoord.xy);

    int iterations;
    vec3 collision;
    float fog;
    float lightStrength = trace(rotmat * (cameraPosition) + vec3(-1.,.7,0.), direction, collision, iterations, fog);

    vec3 fogColor = vec3(dot(direction, light));

    vec3 normal = calcNormal(collision, hitThreshold);

    // float d = distance(collision, cameraPosition);
    float ol = .5;
    vec3 c = color(normal.x * normal.y * normal.z);
    vec3 f = mix(vec3(pow(occlusion(iterations) + lightStrength, 2.)) * .5, fogColor , fog);
    gl_FragColor = vec4(
        f * 1.,
        1.
    );
    // gl_FragColor = vec4(vec3(fog), 1.);
}
