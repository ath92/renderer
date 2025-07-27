import * as THREE from "three";
import { sceneGraph } from "./blob-tree";
import playerControls from "./player-controls";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
const scene = new THREE.Scene();

const wireframeMaterial = new THREE.MeshBasicMaterial({
  color: 0x00ff00,
  wireframe: true,
  opacity: 0.01,
  transparent: true,
});

let spheres = new Set<THREE.Mesh>();

export function syncSpheres() {
  const new_spheres = new Set<THREE.Mesh>();
  sceneGraph.traverse((node) => {
    if (node.type === "leaf") {
      let sphere: THREE.Mesh;
      let m = scene.getObjectByName(node.id);
      if (m) {
        sphere = m as THREE.Mesh;
      } else {
        const geometry = new THREE.SphereGeometry(node.scale, 16, 8);
        sphere = new THREE.Mesh(geometry, wireframeMaterial);
        sphere.name = node.id;
        scene.add(sphere);
      }
      sphere.position.set(
        node.transform[12],
        node.transform[13],
        node.transform[14],
      );
      new_spheres.add(sphere);
    }
  });
  for (let sphere of spheres) {
    if (!new_spheres.has(sphere)) {
      sphere.geometry.dispose();
      sphere.remove();
    }
  }
  spheres = new_spheres;
}

export function initThreeScene(canvas: HTMLCanvasElement) {
  const camera = new THREE.PerspectiveCamera(
    53.13,
    canvas.width / canvas.height,
    0.1,
    1000,
  );

  const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true });
  renderer.setSize(canvas.width, canvas.height);

  syncSpheres();

  const transform_controls = new TransformControls(camera);
  scene.add(transform_controls.getHelper());
  transform_controls.connect(canvas);

  const raycaster = new THREE.Raycaster();

  const onClick = (e: MouseEvent) => {
    const x = ((e.clientX - window.innerWidth / 2) / window.innerWidth) * 2;
    const y = ((e.clientY - window.innerHeight / 2) / -window.innerHeight) * 2;
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    const intersections = raycaster.intersectObjects([...spheres]);
    const first = intersections[0];

    console.log(first);

    if (first) {
      transform_controls.attach(first.object);
    } else {
      transform_controls.detach();
    }
  };

  transform_controls.addEventListener("dragging-changed", ({ value }) => {
    playerControls.enabled = !value;
  });

  function worldPositionChanged(e: THREE.Event) {
    const obj = transform_controls.object;
    if (!obj) return;

    const node = sceneGraph.getNode(obj.name);
    if (!node || node.type !== "leaf") return;

    const transform = obj.matrixWorld.toArray();

    sceneGraph.updateLeafNodeProperties(obj.name, {
      transform,
    });

    playerControls.hasChanges = transform_controls.dragging;
  }

  transform_controls.addEventListener("change", worldPositionChanged);

  window.addEventListener("click", onClick);

  function animate() {
    requestAnimationFrame(animate);

    const { cameraPosition, cameraDirectionQuat } = playerControls.state;
    camera.position.fromArray(cameraPosition);
    camera.quaternion.fromArray(cameraDirectionQuat);
    camera.scale.z = -1;

    renderer.render(scene, camera);
  }

  animate();
}
