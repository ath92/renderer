import './style.css'
import Regl, { Buffer, Mat4, Vec2, Vec3 } from "regl"
import passThroughVert from "./pass-through-vert.glsl"
import frag from "./fragment-shaders/mandelbox.glsl"
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


const renderSDF = regl<SDFUniforms, SDFAttributes, SDFProps>({
  frag,
  vert: passThroughVert,
  uniforms: {
      screenSize: regl.prop<SDFProps, "screenSize">('screenSize'),
      cameraPosition: regl.prop<SDFProps, "cameraPosition">('cameraPosition'),
      cameraDirection: regl.prop<SDFProps, "cameraDirection">('cameraDirection'),
      scrollX: regl.prop<SDFProps, "scrollX">('scrollX'),
      scrollY: regl.prop<SDFProps, "scrollY">('scrollY'),
  },
  attributes: {
      position
  },
  count: 6,
});

const screenSize: Vec2 = [width, height]

function loop() {
  const state = playerControls.state
  if (state.hasChanges) renderSDF({
    screenSize,
    cameraPosition: state.cameraPosition as Vec3,
    cameraDirection: state.cameraDirection as Mat4,
    scrollX: state.scrollX,
    scrollY: state.scrollY
  })
  requestAnimationFrame(loop)
}

loop()