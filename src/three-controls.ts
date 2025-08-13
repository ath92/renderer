import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { vec3, mat4, quat } from "gl-matrix";
import { hasChanges } from "./has-changes";

// Parse URL parameters for initial camera position and target
const search = new URLSearchParams(window.location.search);
const searchPos = search.get("position");
const searchTarget = search.get("target");

const initialPosition = searchPos
  ? searchPos.split(",").map((s) => parseFloat(s))
  : [0, 0, 15];

const initialTarget = searchTarget
  ? searchTarget.split(",").map((s) => parseFloat(s))
  : [0, 0, 0];

class ThreeControls {
  private camera: THREE.PerspectiveCamera | null = null;
  private controls: OrbitControls | null = null;
  private _enabled = true;

  // Keep track of previous state to detect changes
  private previousPosition = new THREE.Vector3();
  private previousTarget = new THREE.Vector3();
  private previousZoom = 1;

  initialize(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, domElement);

    // Set initial position and target
    camera.position.set(initialPosition[0], initialPosition[1], initialPosition[2]);
    this.controls.target.set(initialTarget[0], initialTarget[1], initialTarget[2]);

    // Configure controls for better mobile experience
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enableZoom = true;
    this.controls.enablePan = true;
    this.controls.enableRotate = true;

    // Set reasonable limits
    this.controls.minDistance = 0.1;
    this.controls.maxDistance = 1000;
    this.controls.maxPolarAngle = Math.PI; // Allow full rotation

    // Store initial state for change detection
    this.previousPosition.copy(camera.position);
    this.previousTarget.copy(this.controls.target);
    this.previousZoom = camera.zoom;

    // Listen for changes
    this.controls.addEventListener('change', () => {
      hasChanges.value = true;
    });

    this.controls.update();
  }

  update() {
    if (this.controls && this.enabled) {
      this.controls.update();
    }
  }

  get enabled() {
    return this._enabled;
  }

  set enabled(value: boolean) {
    this._enabled = value;
    if (this.controls) {
      this.controls.enabled = value;
    }
  }

  get state() {
    if (!this.camera || !this.controls) {
      // Return default state if not initialized
      return {
        hasChanges: false,
        scrollX: 0,
        scrollY: 0,
        cameraPosition: vec3.fromValues(0, 0, 15),
        cameraDirection: mat4.create(),
        cameraDirectionQuat: quat.create(),
        cameraMatrix: mat4.create(),
      };
    }

    // Check if anything has changed
    const positionChanged = !this.camera.position.equals(this.previousPosition);
    const targetChanged = !this.controls.target.equals(this.previousTarget);
    const zoomChanged = this.camera.zoom !== this.previousZoom;
    const has_changes = positionChanged || targetChanged || zoomChanged;

    // Update previous state
    this.previousPosition.copy(this.camera.position);
    this.previousTarget.copy(this.controls.target);
    this.previousZoom = this.camera.zoom;

    // Convert THREE.js camera state to gl-matrix format for compatibility
    const cameraPosition = vec3.fromValues(
      this.camera.position.x,
      this.camera.position.y,
      this.camera.position.z
    );

    const cameraDirectionQuat = quat.fromValues(
      this.camera.quaternion.x,
      this.camera.quaternion.y,
      this.camera.quaternion.z,
      this.camera.quaternion.w
    );

    const cameraDirection = mat4.fromQuat(mat4.create(), cameraDirectionQuat);
    const cameraMatrix = mat4.translate(
      mat4.create(),
      cameraDirection,
      cameraPosition
    );

    return {
      hasChanges: has_changes,
      scrollX: 0, // OrbitControls doesn't use scroll in the same way
      scrollY: 0,
      cameraPosition,
      cameraDirection,
      cameraDirectionQuat,
      cameraMatrix,
    };
  }

  // Expose the underlying position for URL serialization
  get position(): number[] {
    if (!this.camera) return [0, 0, 15];
    return [this.camera.position.x, this.camera.position.y, this.camera.position.z];
  }

  get target(): number[] {
    if (!this.controls) return [0, 0, 0];
    return [this.controls.target.x, this.controls.target.y, this.controls.target.z];
  }

  dispose() {
    if (this.controls) {
      this.controls.dispose();
    }
  }
}

export default new ThreeControls();