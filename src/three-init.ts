import * as THREE from "three";
import { sceneGraph } from "./blob-tree";
import playerControls from "./player-controls";

const scene = new THREE.Scene();

const wireframeMaterial = new THREE.MeshBasicMaterial({
  color: 0x00ff00,
  wireframe: true,
  opacity: 0.01,
  transparent: true,
});

let sphere_ids = new Set<string>();

export function syncSpheres() {
  const new_sphere_ids = new Set<string>();
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
      new_sphere_ids.add(node.id);
    }
  });
  for (let id of sphere_ids) {
    if (!new_sphere_ids.has(id)) {
      const obj = scene.getObjectByName(id) as THREE.Mesh;
      obj.geometry.dispose();
      obj.remove();
    }
  }
  sphere_ids = new_sphere_ids;
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
