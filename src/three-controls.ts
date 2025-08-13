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

  // External camera reference for reading state (from React Three Fiber)
  private externalCamera: THREE.Camera | null = null;

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

  syncFromCamera(camera: THREE.Camera) {
    this.externalCamera = camera;
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
    // Use external camera if available (from React Three Fiber), otherwise use internal camera
    const activeCamera = this.externalCamera || this.camera;
    
    if (!activeCamera) {
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

    // Check if anything has changed by comparing with previous state
    const positionChanged = !activeCamera.position.equals(this.previousPosition);
    const zoomChanged = (activeCamera as any).zoom !== this.previousZoom;
    
    // For target change detection, we need the controls
    let targetChanged = false;
    if (this.controls) {
      targetChanged = !this.controls.target.equals(this.previousTarget);
    }
    
    const has_changes = positionChanged || targetChanged || zoomChanged;

    // Update previous state
    this.previousPosition.copy(activeCamera.position);
    if (this.controls) {
      this.previousTarget.copy(this.controls.target);
    }
    this.previousZoom = (activeCamera as any).zoom || 1;

    // Convert THREE.js camera state to gl-matrix format for compatibility
    const cameraPosition = vec3.fromValues(
      activeCamera.position.x,
      activeCamera.position.y,
      activeCamera.position.z
    );

    // Get the camera's world matrix (which includes both rotation and position)
    activeCamera.updateMatrixWorld();
    const worldMatrix = activeCamera.matrixWorld.elements;
    
    // Convert THREE.js matrix (column-major) to gl-matrix format
    const cameraMatrix = mat4.fromValues(
      worldMatrix[0], worldMatrix[1], worldMatrix[2], worldMatrix[3],
      worldMatrix[4], worldMatrix[5], worldMatrix[6], worldMatrix[7],
      worldMatrix[8], worldMatrix[9], worldMatrix[10], worldMatrix[11],
      worldMatrix[12], worldMatrix[13], worldMatrix[14], worldMatrix[15]
    );

    // Extract rotation part (upper-left 3x3) for cameraDirection
    const cameraDirection = mat4.fromValues(
      worldMatrix[0], worldMatrix[1], worldMatrix[2], 0,
      worldMatrix[4], worldMatrix[5], worldMatrix[6], 0,
      worldMatrix[8], worldMatrix[9], worldMatrix[10], 0,
      0, 0, 0, 1
    );

    const cameraDirectionQuat = quat.fromValues(
      activeCamera.quaternion.x,
      activeCamera.quaternion.y,
      activeCamera.quaternion.z,
      activeCamera.quaternion.w
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
    const activeCamera = this.externalCamera || this.camera;
    if (!activeCamera) return [0, 0, 15];
    return [activeCamera.position.x, activeCamera.position.y, activeCamera.position.z];
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