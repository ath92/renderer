import './style.css'
import Regl, { Buffer, Framebuffer, Mat4, Renderbuffer, Texture, Vec2, Vec3 } from "regl"
//@ts-ignore
import PoissonDisk from "fast-2d-poisson-disk-sampling"
import passThroughVert from "./pass-through-vert.glsl"
import playerControls from './player-controls'

const urlParams = new URLSearchParams(window.location.search);
const fractal = urlParams.get('fractal') || 'mandelbulb';
let performance = parseInt(urlParams.get("performance") as string | null ?? "0")

const maxPerformance = 4

let repeat = 2 ** performance

const canvas = document.createElement('canvas');
document.querySelector('#app')!.appendChild(canvas);
// resize to prevent rounding errors
const width = window.innerWidth - (window.innerWidth % 8);
const height = window.innerHeight - (window.innerHeight % 8);
canvas.width = width
canvas.height = height
  
let frame = 0
let step = 0

window.addEventListener("keyup", (e: KeyboardEvent) => {
  if (Array(maxPerformance).fill(0).map((_, i) => i.toString()).includes(e.key)) {
    const newSearch = new URLSearchParams(location.search)
    newSearch.set("performance", e.key)
    newSearch.set("position", playerControls.position.map((n) => n).join(","))
    newSearch.set("direction", playerControls.state.cameraDirection.map((n) => n).join(","))
    // location.href = `${location.origin}${location.pathname}?${newSearch}`
    performance = parseInt(e.key) - 1
    repeat = 2 ** performance
    step = 0
    frame = 0
  }
});

const { default: frag } = await import(`./fragment-shaders/${fractal}.glsl`)
const context = canvas.getContext("webgl", {
    preserveDrawingBuffer: false,
});

if (!context) throw new Error("no context")

const regl = Regl(context); // no params = full screen canvas

const precisionFbos = Array(maxPerformance).fill(0).map((_, i) => {
  const repeat = 2 ** i
  const shape = [width / repeat, height / repeat] as [number, number]
  const color = regl.texture({
    shape,
    // mag: 'linear',
  })

  console.log(shape, repeat)
  
  const fbo  = regl.framebuffer({
    shape,
    depth: false,
    color,
  })
  
  function shuffleArray(array: any[]) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
  }
  
  const offsets: [number, number][] = new PoissonDisk({
    shape: [repeat, repeat],
    radius: .2,
  }).fill();

  if(repeat ===9) {console.log(offsets)}
  
  shuffleArray(offsets)
  
  // offsets.unshift([repeat / 2, repeat / 2])
  offsets.unshift([0, 0])

  return {
    fbo,
    shape,
    offsets,
  }
});

const screenTex1 = regl.texture({
  width,
  height,
  mag: 'nearest',
  // mag: 'linear',
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
  mag: 'nearest',
  // mag: 'linear',
})

const screenBuffer2 = regl.framebuffer({
  width,
  height,
  depth: false,
  color: screenTex2,
})

const pingpong = (frame: number) => frame % 2 === 0 ? [screenBuffer1, screenBuffer2]: [screenBuffer2, screenBuffer1]

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

type SDFProps = SDFUniforms & {
  target: Framebuffer
}

const position = regl.buffer([
  [-1, -1],
  [1, -1],
  [1,  1],
  [-1, -1],   
  [1, 1,],
  [-1, 1]
]);

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
  framebuffer: regl.prop<SDFProps, "target">("target")
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
  step: number,
  repeat: number,
  screenSize: Vec2,
  totalSteps: number,
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
      uniform float step;
      uniform float repeat;
      uniform vec2 screenSize;

      uniform float totalSteps;

      void main () {
        vec2 xy = gl_FragCoord.xy / screenSize;
        vec2 m = mod(gl_FragCoord.xy, repeat);


        vec4 current = texture2D(existingTexture, xy);
        vec2 samplexy = xy + ((m - offset) / 2.) / screenSize;
        vec4 sample = texture2D(inputTexture, samplexy);

        float maxDist = sqrt(2. * repeat * repeat);
        float d = distance(m, offset) / maxDist;
        float dist = min(d, 1.00 - d); 
        //dist = d;

        float weight = clamp(pow((1. - dist), pow(step, sqrt(2.)/2.)), 0., 1.);
        gl_FragColor = mix(current, sample, weight);
        // gl_FragColor = vec4(m - offset ,0., 1.);
      }
  `,
  uniforms: {
      existingTexture: regl.prop<UpsampleCanvasUniforms, 'existingTexture'>('existingTexture'),
      inputTexture: regl.prop<UpsampleCanvasUniforms, 'inputTexture'>('inputTexture'),
      offset: regl.prop<UpsampleCanvasUniforms, 'offset'>('offset'),
      step: regl.prop<UpsampleCanvasUniforms, 'step'>('step'),
      repeat: regl.prop<UpsampleCanvasUniforms, 'repeat'>('repeat'),
      screenSize: regl.prop<UpsampleCanvasUniforms, 'screenSize'>('screenSize'),
      totalSteps: regl.prop<UpsampleCanvasUniforms, 'totalSteps'>('totalSteps'),
  },
  attributes: {
      position
  },
  count: 6,
  framebuffer: regl.prop<FramebufferProp, "framebuffer">("framebuffer"),
});

let isRendering = true
let from: Framebuffer

let avgFrameTime = 1000/60
const numSamples = 20
function loop() {
  const start = Date.now()

  const state = playerControls.state
  const { fbo, shape, offsets } = precisionFbos[performance]
  const [source, target] = pingpong(frame)
  if (!from) from = source
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
      target: fbo,
    })
    upsample({
      inputTexture: fbo,
      existingTexture: from,
      offset,
      framebuffer: target,
      step,
      repeat,
      screenSize: [width, height],
      totalSteps: offsets.length,
    })
    drawToCanvas({
      inputTexture: target
    })
    // not so nice hack to force syncronouuus drawing
    target.use(() => regl.read({ width: 1, height: 1 }))
    isRendering = true
  } else isRendering = false

  const frameTime = Date.now() - start
  avgFrameTime = ((numSamples - 1) * avgFrameTime + frameTime) / numSamples

  if (isRendering && frame % 60 === 0) {
    const fps = 1000 / avgFrameTime
    console.log("fps", fps)
    if (fps > 120) {
      const nextPerformance = Math.max(0, performance - 1)
      performance = nextPerformance
      repeat = 2 ** nextPerformance
    } else if (fps < 60) {
      const nextPerformance = Math.min(maxPerformance - 1, performance + 1)
      performance = nextPerformance
      repeat = 2 ** nextPerformance
    }
  }

  requestAnimationFrame(() => loop())

  from = target

  step++
  frame++
}

loop()
