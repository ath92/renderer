import './style.css'
import Regl, { Buffer, Framebuffer, Mat4, Renderbuffer, Texture, Vec2, Vec3, Vec4 } from "regl"
import passThroughVert from "./pass-through-vert.glsl"
import frag from "./fragment-shaders/menger.glsl"
import playerControls from './player-controls'

const canvas = document.createElement('canvas');
document.querySelector('#app')!.appendChild(canvas);
// resize to prevent rounding errors
let width = window.innerWidth;
let height = window.innerHeight
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

const shape = [width / 2, height / 2] as [number, number]

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
  weights: Vec4
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
      uniform vec4 weights;
      varying vec2 uv;

      void main () {
        vec2 xy = uv * 0.5 + 0.5;
        vec2 m = mod(gl_FragCoord.xy - vec2(.5), 2.);
        bool left = m.x < .5;
        bool top = m.y < .5;
        float weight = 
          float(left && top) * weights.x + 
          float(!left && top) * weights.y +
          float(left && !top) * weights.z +
          float(!left && !top) * weights.w;

        vec4 current = texture2D(existingTexture, xy);
        vec4 color = texture2D(inputTexture, xy);
        gl_FragColor = mix(current, color, weight);
        // gl_FragColor = vec4(weight, 0 ,0., 1.);
      }
  `,
  uniforms: {
      existingTexture: regl.prop<UpsampleCanvasUniforms, 'existingTexture'>('existingTexture'),
      inputTexture: regl.prop<UpsampleCanvasUniforms, 'inputTexture'>('inputTexture'),
      weights: regl.prop<UpsampleCanvasUniforms, 'weights'>('weights'),
  },
  attributes: {
      position
  },
  count: 6,
  framebuffer: regl.prop<FramebufferProp, "framebuffer">("framebuffer"),
});

const steps: {
  offset: Vec2,
  weights: Vec4,
}[] = [
  {
    offset: [0, 0],
    weights: [
      1, 1, 
      1, 1
    ],
  },
  {
    offset: [1, 1],
    weights: [
      0, 0, 
      0, 1
    ],
  },
  {
    offset: [1, 0],
    weights: [
      0, 1, 
      0, 0
    ],
  },
  {
    offset: [0, 1],
    weights: [
      0, 0, 
      1, 0
    ],
  },
]

// if has changes, render new thing immediately to screen (?)
// else if not yet highest resolution, upsample
// first make it render to 1/4 resolution
// and then render that to screen


const screenBuffer1 = regl.framebuffer({
  width,
  height,
  depth: false,
})

const screenBuffer2 = regl.framebuffer({
  width,
  height,
  depth: false,
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
  if (step < steps.length) {
    const { offset, weights } = steps[step]
    renderSDF({
      screenSize: shape,
      cameraPosition: state.cameraPosition as Vec3,
      cameraDirection: state.cameraDirection as Mat4,
      scrollX: state.scrollX,
      scrollY: state.scrollY,
      offset,
      repeat: [2, 2],
    })
    upsample({
      inputTexture: fbo,
      existingTexture: source,
      weights,
      framebuffer: target,
    })
    drawToCanvas({
      inputTexture: target
    })
    console.log(offset, weights)
  }
  
  requestAnimationFrame(loop)
  if (frame % 40 === 0) step++
  frame++
}

loop()