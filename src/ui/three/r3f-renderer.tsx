import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { TransformControls } from "@react-three/drei";
import {
  csgTree,
  TreeNode,
  isLeafNode,
  csgChangeCounter,
} from "../../csg-tree";
import { selectedNode } from "../../selection";
import { signal, useSignalEffect } from "@preact/signals-react";
import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { hasChanges } from "../../has-changes";
import playerControls from "../../player-controls";
import { useSignals } from "@preact/signals-react/runtime";

function Sphere({ node }: { node: TreeNode }) {
  if (!isLeafNode(node)) return null;

  const ref = useRef<THREE.Mesh>(null!);

  useSignalEffect(() => {
    if (ref.current) {
      ref.current.position.set(
        node.data.get("transform")[12],
        node.data.get("transform")[13],
        node.data.get("transform")[14],
      );
      ref.current.scale.set(
        node.data.get("scale"),
        node.data.get("scale"),
        node.data.get("scale"),
      );
    }
  });

  return (
    <mesh
      ref={ref}
      name={node.id}
      onClick={(e) => {
        e.stopPropagation();
        selectedNode.value = node.id;
      }}
    >
      <sphereGeometry args={[1, 8, 4]} />
      <meshBasicMaterial wireframe opacity={0.1} transparent />
    </mesh>
  );
}

function CameraUpdater() {
  useFrame(({ camera }) => {
    const { cameraPosition, cameraDirectionQuat } = playerControls.state;
    camera.position.fromArray(cameraPosition);
    camera.quaternion.fromArray(cameraDirectionQuat);
    camera.scale.z = -1;
  });
  return null;
}

const showHelperSpheres = signal(false);

function SpheresScene({ counter }: { counter: number }) {
  useSignals();
  const nodes = useMemo(() => {
    const newNodes: TreeNode[] = [];
    csgTree.traverse((node) => {
      newNodes.push(node);
    });

    return newNodes;
  }, [counter]);

  const transformControlsRef = useRef<any>(null);
  const { scene } = useThree();

  const [controls_target, set_controls_target] = useState<THREE.Mesh>();

  useSignalEffect(() => {
    const id = selectedNode.value;
    const object = id ? scene.getObjectByName(id) : null;
    set_controls_target(object as THREE.Mesh);
  });

  useEffect(() => {
    function toggleHelperSpheres(e: KeyboardEvent) {
      if (e.key === "h") {
        showHelperSpheres.value = !showHelperSpheres.peek();
      }
    }
    window.addEventListener("keyup", toggleHelperSpheres);
    return () => window.removeEventListener("keyup", toggleHelperSpheres);
  }, []);

  return (
    <>
      <CameraUpdater />
      <ambientLight />
      <pointLight position={[10, 10, 10]} />
      {showHelperSpheres.value &&
        nodes.map((node) => <Sphere key={node.id} node={node} />)}

      {controls_target && (
        <TransformControls
          ref={transformControlsRef}
          onChange={() => {
            if (transformControlsRef.current) {
              playerControls.enabled = !transformControlsRef.current.dragging;
              if (transformControlsRef.current.object) {
                const object = transformControlsRef.current.object;
                const node = csgTree.getNode(object.name);

                csgTree.updateLeafNodeProperties(node, {
                  transform: object.matrixWorld.toArray(),
                });
                hasChanges.value = transformControlsRef.current.dragging;
              }
            }
          }}
          object={controls_target}
        />
      )}
    </>
  );
}

export function R3fRenderer() {
  return (
    <Canvas camera={{ fov: 53.13 }}>
      <SpheresScene counter={csgChangeCounter.value} />
    </Canvas>
  );
}
