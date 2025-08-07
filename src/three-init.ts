import * as THREE from "three";
import { csgTree, isLeafNode } from "./csg-tree";
import playerControls from "./player-controls";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { selectedNode } from "./selection";
import { effect } from "@preact/signals-react";
import { hasChanges } from "./has-changes";
import { TreeID } from "loro-crdt";
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

function syncSphere(nodeId?: TreeID) {
  if (!nodeId) return;
  const node = csgTree.getNode(nodeId);
  if (!node || !isLeafNode(node)) return;
  let m = scene.getObjectByName(node.id);
  let sphere = m as THREE.Mesh;
  if (m) {
    if (m.userData.scale !== node.data.get("scale")) {
      const geometry = new THREE.SphereGeometry(node.data.get("scale"), 16, 8);
      sphere.geometry = geometry;
    }
  } else {
    const geometry = new THREE.SphereGeometry(node.data.get("scale"), 16, 8);
    sphere = new THREE.Mesh(geometry, defaultMaterial);
    sphere.name = node.id;
    scene.add(sphere);
  }
  sphere.userData.scale = node.data.get("scale");
  sphere.position.set(
    node.data.get("transform")[12],
    node.data.get("transform")[13],
    node.data.get("transform")[14],
  );
  return sphere;
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
      selectedNode.value = first.object.name as TreeID;
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

    const node = csgTree.getNode(obj.name as TreeID);
    if (!node || !isLeafNode(node)) return;

    const transform = obj.matrixWorld.toArray();

    csgTree.updateLeafNodeProperties(node, {
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
