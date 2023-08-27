import { vec3, mat4, quat } from 'gl-matrix';

const forward = vec3.fromValues(0, 0, 1);
const backward = vec3.fromValues(0, 0, -1);
const left = vec3.fromValues(-1, 0, 0);
const right = vec3.fromValues(1, 0, 0);

const minSpeed = 0.00005;

function getTouchEventCoordinates(touchEvent: TouchEvent) {
    const lastTouch = touchEvent.touches[touchEvent.touches.length - 1];
    return {
        x: lastTouch.clientX,
        y: lastTouch.clientY,
    }
}

class PlayerControls {
    acceleration: number
    friction: number
    position: vec3 = vec3.fromValues(0, 0, -9)
    direction: quat= quat.create()
    speed: vec3 = vec3.fromValues(0, 0, 0.01)
    mouseSensitivity: number
    touchSensitivity: number
    isPanning: boolean = false
    mouseX: number = 0
    mouseY: number = 0
    touchX: number = 0
    touchY: number = 0
    touchStartX: number
    touchStartY: number
    scrollX: number = 0
    scrollY: number = 0
    directionKeys = {
        forward: false,
        backward: false,
        left: false,
        right: false,
    }
    sprintMode: boolean = false
    isTouching: boolean = false
    hasMovedSinceMousedown = false
    hasChanges = true

    constructor(acceleration = 0.00010, friction = 0.12, mouseSensitivity = 0.15, touchSensitivity = 0.012) {
        // TODO: cleanup event listeners
        this.acceleration = acceleration;
        this.friction = friction;
        this.mouseSensitivity = mouseSensitivity;
        this.touchSensitivity = touchSensitivity;
        this.touchStartX = window.innerWidth / 2;
        this.touchStartY = window.innerHeight / 2;

        document.addEventListener('keydown', this.handleKeyboardEvent);
        document.addEventListener('keyup', this.handleKeyboardEvent);

        document.addEventListener('mousedown', (e: MouseEvent) => {
            this.isPanning = true;
        });

        document.addEventListener('mouseup', (e) => {
            this.isPanning = false;
        });

        document.addEventListener('pointerlockchange', () => {
            this.isPanning = !!document.pointerLockElement;
        }, false);

        document.addEventListener('mousemove', e => {
            if (!this.isPanning && !this.isTouching) return;
            this.hasMovedSinceMousedown = true;
            this.mouseX += e.movementX * this.mouseSensitivity;
            this.mouseY += e.movementY * this.mouseSensitivity;
            this.hasChanges = true
        });

        document.addEventListener('touchstart', e => {
            this.directionKeys.forward = true;
            this.hasChanges = true
            this.isTouching = true;
            const { x, y } = getTouchEventCoordinates(e);
            this.touchX = x;
            this.touchY = y;
            this.touchStartX = x;
            this.touchStartY = y;
        });

        document.addEventListener('touchmove', e => {
            const { x, y } = getTouchEventCoordinates(e);
            this.touchX = x;
            this.touchY = y;
            this.hasChanges = true
        });

        const onTouchOver = () => {
            this.directionKeys.forward = false;
            this.isTouching = false;
        }

        window.addEventListener("wheel", e => {
            this.scrollY += e.deltaY / 5000;
            this.scrollX += e.deltaX / 5000;
            this.hasChanges = true
        });

        document.addEventListener('touchend', onTouchOver);
        document.addEventListener('touchcancel', onTouchOver);
        document.addEventListener('mouseup', onTouchOver);

        requestAnimationFrame(() => this.loop());
    }

    handleKeyboardEvent = (keyboardEvent: KeyboardEvent) => {
        const { code, type, shiftKey } = keyboardEvent;
        const value = type === 'keydown';
        if (code === 'KeyW' || code === 'ArrowUp') this.directionKeys.forward = value;
        if (code === 'KeyS' || code === 'ArrowDown') this.directionKeys.backward = value;
        if (code === 'KeyA' || code === 'ArrowLeft') this.directionKeys.left = value;
        if (code === 'KeyD' || code === 'ArrowRight') this.directionKeys.right = value;
        this.sprintMode = shiftKey;

        

        if (type === 'keydown' && code === 'KeyF') {
            if (!!document.pointerLockElement) {
                document.exitPointerLock();
            } else {
                document.body.requestPointerLock();
            }
        }
    };
    
    loop() {
        if (this.isTouching) {
            this.mouseX += (this.touchX - this.touchStartX) * this.touchSensitivity;
            this.mouseY += (this.touchY - this.touchStartY) * this.touchSensitivity;
        }
        this.mouseY = Math.min(this.mouseY, 90);
        this.mouseY = Math.max(this.mouseY, -90);

        quat.fromEuler(
            this.direction,
            this.mouseY,
            this.mouseX,
            0
        );
    

        // strafing with keys
        const diff = vec3.create();
        if (this.directionKeys.forward) vec3.add(diff, diff, forward);
        if (this.directionKeys.backward) vec3.add(diff, diff, backward);
        if (this.directionKeys.left) vec3.add(diff, diff, left);
        if (this.directionKeys.right) vec3.add(diff, diff, right);

        // vec3.normalize(diff, diff);
        vec3.transformQuat(diff, diff, this.direction);
        vec3.scale(diff, diff, (this.sprintMode ? 4 : 1) * this.acceleration);
        // const currentDistance = getCurrentDistance(this.position)
        vec3.scale(this.speed, this.speed, 1 - this.friction);
        if (vec3.length(this.speed) < minSpeed) {
            vec3.set(this.speed, 0, 0, 0);
        }
        this.hasChanges = this.hasChanges || vec3.len(this.speed) > 0
        vec3.add(this.speed, this.speed, diff);
        vec3.add(this.position, this.position, this.speed);
    
        requestAnimationFrame(() => this.loop());
    }

    get state() {
        const hasChanges = this.hasChanges
        this.hasChanges = false
        return {
            hasChanges,
            scrollX: this.scrollX,
            scrollY: this.scrollY,
            cameraPosition: [...this.position],
            cameraDirection: mat4.fromQuat(mat4.create(), this.direction),
            cameraDirectionQuat: [...this.direction],
        }
    }
}

export default new PlayerControls(

)
