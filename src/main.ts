import './style.css'
import Regl, { Buffer, Framebuffer, Mat4, Renderbuffer, Texture, Vec2, Vec3, Vec4 } from "regl"
//@ts-ignore
import PoissonDisk from "fast-2d-poisson-disk-sampling"
import passThroughVert from "./pass-through-vert.glsl"
import frag from "./fragment-shaders/klein.glsl"
import playerControls from './player-controls'

const canvas = document.createElement('canvas');
document.querySelector('#app')!.appendChild(canvas);

const repeat = 2
// resize to prevent rounding errors
let width = window.innerWidth;
let height = Math.min(window.innerHeight, Math.floor(width * (window.innerHeight / window.innerWidth)));
while (width % repeat) width--;
while (height % repeat) height--;
canvas.width = width;
canvas.height = height;
const context = canvas.getContext("webgl", {
    preserveDrawingBuffer: false,
});

if (!context) throw new Error("no context")

const regl = Regl(context); // no params = full screen canvas


type SDFUniforms = {
  screenSize: Vec2,
  cameraPosition: Vec3,
  cameraDirection: Mat4,
  scrollX: number,
  scrollY: number,
  offset: Vec2,
  repeat: Vec2,
}

type SDFAttributes = {
  position: Buffer,
}

type SDFProps = SDFUniforms

const position = regl.buffer([
  [-1, -1],
  [1, -1],
  [1,  1],
  [-1, -1],   
  [1, 1,],
  [-1, 1]
]);

const shape = [Math.floor(width / repeat), Math.floor(height / repeat)] as [number, number]

const color = regl.texture({
  shape,
  // mag: 'linear',
})

const fbo  = regl.framebuffer({
  shape,
  depth: false,
  color,
})

const renderSDF = regl<SDFUniforms, SDFAttributes, SDFProps>({
  frag,
  vert: passThroughVert,
  uniforms: {
      screenSize: regl.prop<SDFProps, "screenSize">('screenSize'),
      cameraPosition: regl.prop<SDFProps, "cameraPosition">('cameraPosition'),
      cameraDirection: regl.prop<SDFProps, "cameraDirection">('cameraDirection'),
      scrollX: regl.prop<SDFProps, "scrollX">('scrollX'),
      scrollY: regl.prop<SDFProps, "scrollY">('scrollY'),
      offset: regl.prop<SDFProps, "offset">('offset'),
      repeat: regl.prop<SDFProps, "repeat">('repeat'),
  },
  attributes: {
      position
  },
  count: 6,
  framebuffer: fbo
});

type DrawToCanvasUniforms = {
  inputTexture: Texture | Framebuffer
}
// render texture to screen
const drawToCanvas = regl<DrawToCanvasUniforms, {}, DrawToCanvasUniforms>({
  vert: passThroughVert,
  frag: `
      precision highp float;
      uniform sampler2D inputTexture;
      varying vec2 uv;



      void main () {
        vec2 xy = uv * 0.5 + 0.5;
        vec4 color = texture2D(inputTexture, xy);
        gl_FragColor = color;
      }
  `,
  uniforms: {
      inputTexture: regl.prop<DrawToCanvasUniforms, 'inputTexture'>('inputTexture'),
  },
  attributes: {
      position
  },
  count: 6,
});

type UpsampleCanvasUniforms = {
  existingTexture: Texture | Framebuffer
  inputTexture: Texture | Framebuffer
  offset: Vec2,
  strength: number,
  repeat: number,
}

type FramebufferProp = {
  framebuffer: Framebuffer | Renderbuffer
}

const upsample = regl<UpsampleCanvasUniforms, {}, UpsampleCanvasUniforms & FramebufferProp>({
  vert: passThroughVert,
  frag: `
      precision highp float;
      uniform sampler2D inputTexture;
      uniform sampler2D existingTexture;
      varying vec2 uv;
      uniform vec2 offset;
      uniform float strength;
      uniform float repeat;

      void main () {
        vec2 xy = uv * 0.5 + 0.5;
        vec2 m = mod(gl_FragCoord.xy , repeat);
        vec2 modOffset = mod(offset, 2.);

        float dist = min(length(m - offset), length(m - modOffset)) / repeat;
        // float dist = length(m - offset) / repeat.;

        float weight = pow((1. - dist), strength / 5.);
        vec4 current = texture2D(existingTexture, xy);
        vec4 color = texture2D(inputTexture, xy);
        gl_FragColor = mix(current, color, weight);
        // gl_FragColor = vec4(weight, 0 ,0., 1.);
      }
  `,
  uniforms: {
      existingTexture: regl.prop<UpsampleCanvasUniforms, 'existingTexture'>('existingTexture'),
      inputTexture: regl.prop<UpsampleCanvasUniforms, 'inputTexture'>('inputTexture'),
      offset: regl.prop<UpsampleCanvasUniforms, 'offset'>('offset'),
      strength: regl.prop<UpsampleCanvasUniforms, 'strength'>('strength'),
      repeat: regl.prop<UpsampleCanvasUniforms, 'repeat'>('repeat'),
  },
  attributes: {
      position
  },
  count: 6,
  framebuffer: regl.prop<FramebufferProp, "framebuffer">("framebuffer"),
});

const offsets: [number, number][] = new PoissonDisk({
  shape: [repeat, repeat],
  radius: .25,
}).fill();
console.log(offsets)

// if has changes, render new thing immediately to screen (?)
// else if not yet highest resolution, upsample
// first make it render to 1/4 resolution
// and then render that to screen


const screenTex1 = regl.texture({
  width,
  height,
  mag: 'linear',
})

const screenBuffer1 = regl.framebuffer({
  width,
  height,
  depth: false,
  color: screenTex1,
})

const screenTex2 = regl.texture({
  width,
  height,
  mag: 'linear',
})

const screenBuffer2 = regl.framebuffer({
  width,
  height,
  depth: false,
  color: screenTex2,
})

let frame = 0

const pingpong = () => frame % 2 === 0 ? [screenBuffer1, screenBuffer2]: [screenBuffer2, screenBuffer1]

let step = 0

function loop() {
  const state = playerControls.state
  const [source, target] = pingpong()
  if (state.hasChanges) { 
    step = 0
  }
  if (step < offsets.length) {
    const offset = offsets[step]
    renderSDF({
      screenSize: shape,
      cameraPosition: state.cameraPosition as Vec3,
      cameraDirection: state.cameraDirection as Mat4,
      scrollX: state.scrollX,
      scrollY: state.scrollY,
      offset,
      repeat: [repeat, repeat],
    })
    upsample({
      inputTexture: fbo,
      existingTexture: source,
      offset,
      framebuffer: target,
      strength: step,
      repeat,
    })
    drawToCanvas({
      inputTexture: target
    })
    console.log("doing this!")
  }
  
  requestAnimationFrame(loop)
  step++
  frame++
}

loop()