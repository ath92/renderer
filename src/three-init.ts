import * as THREE from "three";
import { NodeId, csgTree } from "./csg-tree";
import playerControls from "./player-controls";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { selectedNode } from "./selection";
import { effect } from "@preact/signals-react";
import { hasChanges } from "./has-changes";
const scene = new THREE.Scene();

const selectedMaterial = new THREE.MeshBasicMaterial({
  color: 0x0099ff,
  wireframe: true,
  opacity: 0.15,
  transparent: true,
});

const defaultMaterial = new THREE.MeshBasicMaterial({
  color: 0x00ff00,
  wireframe: true,
  opacity: 0.0,
  transparent: true,
});

let spheres = new Set<THREE.Mesh>();

function syncSphere(nodeId?: NodeId) {
  if (!nodeId) return;
  const node = csgTree.getNode(nodeId);
  if (!node || node.type !== "leaf") return;
  if (node.type === "leaf") {
    let m = scene.getObjectByName(node.id);
    let sphere = m as THREE.Mesh;
    if (m) {
      if (m.userData.scale !== node.scale) {
        const geometry = new THREE.SphereGeometry(node.scale, 16, 8);
        sphere.geometry = geometry;
      }
    } else {
      const geometry = new THREE.SphereGeometry(node.scale, 16, 8);
      sphere = new THREE.Mesh(geometry, defaultMaterial);
      sphere.name = node.id;
      scene.add(sphere);
    }
    sphere.userData.scale = node.scale;
    sphere.position.set(
      node.transform[12],
      node.transform[13],
      node.transform[14],
    );
    return sphere;
  }
}

export function syncSpheres() {
  const new_spheres = new Set<THREE.Mesh>();
  csgTree.traverse((node) => {
    const sphere = syncSphere(node.id);
    if (sphere) new_spheres.add(sphere);
  });
  for (let sphere of spheres) {
    if (!new_spheres.has(sphere)) {
      sphere.geometry.dispose();
      sphere.remove();
    }
  }
  spheres = new_spheres;
}

var transform_controls: TransformControls;

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

  transform_controls = new TransformControls(camera);
  scene.add(transform_controls.getHelper());
  transform_controls.connect(canvas);

  const raycaster = new THREE.Raycaster();

  const onClick = (e: MouseEvent) => {
    const x = ((e.clientX - window.innerWidth / 2) / window.innerWidth) * 2;
    const y = ((e.clientY - window.innerHeight / 2) / -window.innerHeight) * 2;
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    const intersections = raycaster.intersectObjects([...spheres]);
    const first = intersections[0];

    if (first) {
      selectedNode.value = first.object.name;
    } else {
      selectedNode.value = null;
    }
  };

  transform_controls.addEventListener("dragging-changed", ({ value }) => {
    playerControls.enabled = !value;
  });

  function worldPositionChanged() {
    const obj = transform_controls.object;
    if (!obj) return;

    const node = csgTree.getNode(obj.name);
    if (!node || node.type !== "leaf") return;

    const transform = obj.matrixWorld.toArray();

    csgTree.updateLeafNodeProperties(obj.name, {
      transform,
    });

    hasChanges.value = transform_controls.dragging;
  }

  transform_controls.addEventListener("change", worldPositionChanged);

  canvas.addEventListener("click", onClick);

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

effect(() => {
  const id = selectedNode.value;
  if (!transform_controls) return;

  const current = transform_controls.object as THREE.Mesh;
  if (current) current.material = defaultMaterial;

  if (id === null) {
    transform_controls.detach();
    return;
  }

  const obj = scene.getObjectByName(id) as THREE.Mesh;
  if (!obj) return;

  transform_controls.attach(obj);
  obj.material = selectedMaterial;
});

effect(() => {
  if (hasChanges.value) {
    console.log("yes");
    syncSphere(selectedNode.value ?? undefined);
  }
});
