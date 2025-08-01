import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { TransformControls } from "@react-three/drei";
import { csgTree, CSGNode } from "../../csg-tree";
import { selectedNode } from "../../selection";
import { useSignalEffect, useComputed } from "@preact/signals-react";
import * as THREE from "three";
import { useRef, useState } from "react";
import { hasChanges } from "../../has-changes";
import playerControls from "../../player-controls";

function Sphere({ node }: { node: CSGNode }) {
  if (node.type !== "leaf") return null;

  const ref = useRef<THREE.Mesh>(null!);

  useSignalEffect(() => {
    if (ref.current) {
      ref.current.position.set(
        node.transform[12],
        node.transform[13],
        node.transform[14],
      );
      ref.current.scale.set(node.scale, node.scale, node.scale);
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
      <sphereGeometry args={[1, 16, 8]} />
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

function SpheresScene() {
  const nodes = useComputed(() => {
    hasChanges.value; // subscribe to hasChanges
    const newNodes: CSGNode[] = [];
    csgTree.traverse((node) => {
      newNodes.push(node);
    });
    return newNodes;
  });

  const transformControlsRef = useRef<any>(null);
  const { scene } = useThree();

  const [controls_target, set_controls_target] = useState<THREE.Mesh>();

  useSignalEffect(() => {
    const id = selectedNode.value;
    const object = id ? scene.getObjectByName(id) : null;
    set_controls_target(object as THREE.Mesh);
  });

  return (
    <>
      <CameraUpdater />
      <ambientLight />
      <pointLight position={[10, 10, 10]} />
      {nodes.value.map((node) => (
        <Sphere key={node.id} node={node} />
      ))}

      {controls_target && (
        <TransformControls
          ref={transformControlsRef}
          onChange={() => {
            if (transformControlsRef.current) {
              playerControls.enabled = !transformControlsRef.current.dragging;
              if (transformControlsRef.current.object) {
                const object = transformControlsRef.current.object;
                csgTree.updateLeafNodeProperties(object.name, {
                  transform: object.matrixWorld.toArray(),
                });
                hasChanges.value = transformControlsRef.current.dragging;
              }
            }
          }}
          object={controls_target}
        />
      )}
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          selectedNode.value = null;
        }}
      >
        <sphereGeometry args={[500, 32, 32]} />
        <meshBasicMaterial side={THREE.BackSide} transparent opacity={0} />
      </mesh>
    </>
  );
}

export function R3fRenderer() {
  return (
    <Canvas camera={{ fov: 53.13 }}>
      <SpheresScene />
    </Canvas>
  );
}
