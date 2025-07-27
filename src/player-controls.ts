import { vec3, mat4, quat, mat3 } from "gl-matrix";

const forward = vec3.fromValues(0, 0, 1);
const backward = vec3.fromValues(0, 0, -1);
const left = vec3.fromValues(-1, 0, 0);
const right = vec3.fromValues(1, 0, 0);
const up = vec3.fromValues(0, 1, 0);

const minSpeed = 0.00005;

function getTouchEventCoordinates(touchEvent: TouchEvent) {
  const lastTouch = touchEvent.touches[touchEvent.touches.length - 1];
  return {
    x: lastTouch.clientX,
    y: lastTouch.clientY,
  };
}

const search = new URLSearchParams(window.location.search);
const searchPos = search.get("position");
const searchDir = search.get("direction");

type Mat3 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
const position = vec3.fromValues(
  ...((searchPos
    ? searchPos.split(",").map((s) => parseFloat(s))
    : [0, 0, 5]) as [number, number, number]),
);
const direction = mat3.fromValues(
  ...((searchDir
    ? searchDir.split(",").map((s) => parseFloat(s))
    : mat3.identity(mat3.create())) as Mat3),
);

const dirVec = vec3.fromValues(0, 0, 1);
vec3.transformMat3(dirVec, dirVec, direction);

const mouseY = vec3.angle(dirVec, up);
const mouseX = vec3.angle(dirVec, right);

class PlayerControls {
  acceleration: number;
  friction: number;
  position: vec3 = position;
  direction: quat = quat.fromMat3(quat.create(), direction);
  speed: vec3 = vec3.fromValues(0, 0, 0);
  mouseSensitivity: number;
  touchSensitivity: number;
  isPanning: boolean = false;
  mouseX: number = mouseX;
  mouseY: number = mouseY;
  touchX: number = 0;
  touchY: number = 0;
  touchStartX: number;
  touchStartY: number;
  scrollX: number = 0;
  scrollY: number = 0;
  directionKeys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
  };
  sprintMode: boolean = false;
  isTouching: boolean = false;
  hasMovedSinceMousedown = false;
  hasChanges = true;

  constructor(
    acceleration = 0.0005,
    friction = 0.12,
    mouseSensitivity = 0.15,
    touchSensitivity = 0.012,
  ) {
    // TODO: cleanup event listeners
    this.acceleration = acceleration;
    this.friction = friction;
    this.mouseSensitivity = mouseSensitivity;
    this.touchSensitivity = touchSensitivity;
    this.touchStartX = window.innerWidth / 2;
    this.touchStartY = window.innerHeight / 2;

    document.addEventListener("keydown", this.handleKeyboardEvent);
    document.addEventListener("keyup", this.handleKeyboardEvent);

    document.addEventListener("mousedown", () => {
      this.isPanning = true;
    });

    document.addEventListener("mouseup", () => {
      this.isPanning = false;
    });

    document.addEventListener(
      "pointerlockchange",
      () => {
        this.isPanning = !!document.pointerLockElement;
      },
      false,
    );

    document.addEventListener("mousemove", (e) => {
      if (!this.isPanning && !this.isTouching) return;
      this.hasMovedSinceMousedown = true;
      this.mouseX += e.movementX * this.mouseSensitivity;
      this.mouseY += e.movementY * this.mouseSensitivity;
      this.hasChanges = true;
    });

    document.addEventListener("touchstart", (e) => {
      this.directionKeys.forward = true;
      this.hasChanges = true;
      this.isTouching = true;
      const { x, y } = getTouchEventCoordinates(e);
      this.touchX = x;
      this.touchY = y;
      this.touchStartX = x;
      this.touchStartY = y;
    });

    document.addEventListener("touchmove", (e) => {
      const { x, y } = getTouchEventCoordinates(e);
      this.touchX = x;
      this.touchY = y;
      this.hasChanges = true;
    });

    const onTouchOver = () => {
      this.directionKeys.forward = false;
      this.isTouching = false;
    };

    window.addEventListener("wheel", (e) => {
      this.scrollY += e.deltaY / 5000;
      this.scrollX += e.deltaX / 5000;
      this.hasChanges = true;
    });

    document.addEventListener("touchend", onTouchOver);
    document.addEventListener("touchcancel", onTouchOver);
    document.addEventListener("mouseup", onTouchOver);

    requestAnimationFrame(() => this.loop());
  }

  handleKeyboardEvent = (keyboardEvent: KeyboardEvent) => {
    const { code, type, shiftKey } = keyboardEvent;
    const value = type === "keydown";
    if (code === "KeyW" || code === "ArrowUp")
      this.directionKeys.forward = value;
    if (code === "KeyS" || code === "ArrowDown")
      this.directionKeys.backward = value;
    if (code === "KeyA" || code === "ArrowLeft")
      this.directionKeys.left = value;
    if (code === "KeyD" || code === "ArrowRight")
      this.directionKeys.right = value;
    this.sprintMode = shiftKey;

    if (type === "keydown" && code === "KeyF") {
      if (!!document.pointerLockElement) {
        document.exitPointerLock();
      } else {
        document.body.requestPointerLock();
      }
    }
  };

  time = performance.now();

  loop() {
    if (this.isTouching) {
      this.mouseX += (this.touchX - this.touchStartX) * this.touchSensitivity;
      this.mouseY += (this.touchY - this.touchStartY) * this.touchSensitivity;
    }
    this.mouseY = Math.min(this.mouseY, 90);
    this.mouseY = Math.max(this.mouseY, -90);

    quat.fromEuler(this.direction, this.mouseY, this.mouseX + 180, 0);

    const now = performance.now();
    const timeDiff = now - this.time;
    const frameTimeFactor = timeDiff / (1000 / 60);

    // strafing with keys
    const diff = vec3.create();
    if (this.directionKeys.forward) vec3.add(diff, diff, forward);
    if (this.directionKeys.backward) vec3.add(diff, diff, backward);
    if (this.directionKeys.left) vec3.add(diff, diff, left);
    if (this.directionKeys.right) vec3.add(diff, diff, right);

    // vec3.normalize(diff, diff);
    vec3.transformQuat(diff, diff, this.direction);
    vec3.scale(
      diff,
      diff,
      (this.sprintMode ? 4 : 1) * this.acceleration * frameTimeFactor,
    );
    // const currentDistance = getCurrentDistance(this.position)
    vec3.scale(this.speed, this.speed, 1 - this.friction);
    if (vec3.length(this.speed) < minSpeed) {
      vec3.set(this.speed, 0, 0, 0);
    }
    this.hasChanges = this.hasChanges || vec3.len(this.speed) > 0;
    vec3.add(this.speed, this.speed, diff);
    vec3.add(this.position, this.position, this.speed);

    this.time = now;

    requestAnimationFrame(() => this.loop());
  }

  get state() {
    const hasChanges = this.hasChanges;
    // this.hasChanges = false;
    //
    const cameraDirection = mat4.fromQuat(mat4.create(), this.direction);
    const cameraMatrix = mat4.translate(
      mat4.create(),
      cameraDirection,
      this.position,
    );
    return {
      hasChanges,
      scrollX: this.scrollX,
      scrollY: this.scrollY,
      cameraPosition: [...this.position],
      cameraDirection,
      cameraDirectionQuat: [...this.direction],
      cameraMatrix,
    };
  }
}

export default new PlayerControls();
