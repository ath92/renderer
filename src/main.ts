import './style.css'
import Regl, { Buffer, Framebuffer, Mat4, Renderbuffer, Texture, Vec2, Vec3, Vec4 } from "regl"
//@ts-ignore
import PoissonDisk from "fast-2d-poisson-disk-sampling"
import passThroughVert from "./pass-through-vert.glsl"
import playerControls from './player-controls'

const urlParams = new URLSearchParams(window.location.search);
const fractal = urlParams.get('fractal') || 'mandelbulb';

(async () => {
  const { default: frag } = await import(`./fragment-shaders/${fractal}.glsl`)
  console.log(frag)
  const canvas = document.createElement('canvas');
  document.querySelector('#app')!.appendChild(canvas);
  
  const repeat = parseInt(new URLSearchParams(location.search).get("performance") as string | null ?? "2")
  document.addEventListener("keyup", (e: KeyboardEvent) => {
    if (Array(10).fill(0).map((_, i) => i.toString()).includes(e.key)) {
      const newSearch = new URLSearchParams(location.search)
      newSearch.set("performance", e.key)
      newSearch.set("position", playerControls.position.map((n) => n).join(","))
      newSearch.set("direction", playerControls.state.cameraDirection.map((n) => n).join(","))
      location.href = `${location.origin}${location.pathname}?${newSearch}`
    }
  })
  // resize to prevent rounding errors
  let width = Math.floor(window.innerWidth);
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
  
  const shape = [width / repeat, height / repeat] as [number, number]
  
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
          float dist = min(d, 1. - d); // -> max .5
          // dist = d;
  
          float weight = clamp(pow((.85 - dist), pow(step, .5)), 0., 1.); // why .85?
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
  
  shuffleArray(offsets)
  
  
  console.log(offsets)
  
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
      // console.log(step)
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
        step,
        repeat,
        screenSize: [width, height],
        totalSteps: offsets.length,
      })
      drawToCanvas({
        inputTexture: target
      })
    }
    
    requestAnimationFrame(loop)
    step++
    frame++
  }
  
  loop()
})()
