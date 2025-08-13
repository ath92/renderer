import { Canvas, useThree } from "@react-three/fiber";
import { TransformControls, OrbitControls } from "@react-three/drei";
import {
  csgTree,
  TreeNode,
  isLeafNode,
  csgChangeCounter,
} from "../../csg-tree";
import { selectedNode } from "../../selection";
import { useSignalEffect } from "@preact/signals-react";
import * as THREE from "three";
import { useMemo, useRef, useState } from "react";
import { hasChanges } from "../../has-changes";

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
      <sphereGeometry args={[1, 16, 8]} />
      <meshBasicMaterial wireframe opacity={0.1} transparent />
    </mesh>
  );
}

function CameraUpdater() {
  // Remove the custom camera updater since OrbitControls will handle camera positioning
  return null;
}

function SpheresScene({ counter }: { counter: number }) {
  console.log("re-render!", counter);
  const nodes = useMemo(() => {
    console.log("hahaha", csgChangeCounter.value, counter);
    const newNodes: TreeNode[] = [];
    csgTree.traverse((node) => {
      newNodes.push(node);
    });

    return newNodes;
  }, [counter]);

  console.log("re-render spheres", nodes.length);

  const transformControlsRef = useRef<any>(null);
  const orbitControlsRef = useRef<any>(null);
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
      <OrbitControls
        ref={orbitControlsRef}
        enableDamping={true}
        dampingFactor={0.05}
        enableZoom={true}
        enablePan={true}
        enableRotate={true}
        minDistance={0.1}
        maxDistance={1000}
        maxPolarAngle={Math.PI}
        onChange={() => {
          // Trigger hasChanges when camera moves to update WebGPU renderer
          hasChanges.value = true;
        }}
      />
      <ambientLight />
      <pointLight position={[10, 10, 10]} />
      {nodes.map((node) => (
        <Sphere key={node.id} node={node} />
      ))}

      {controls_target && (
        <TransformControls
          ref={transformControlsRef}
          onChange={() => {
            if (transformControlsRef.current) {
              // Disable orbit controls when transforming objects
              if (orbitControlsRef.current) {
                orbitControlsRef.current.enabled = !transformControlsRef.current.dragging;
              }
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
      <SpheresScene counter={csgChangeCounter.value} />
    </Canvas>
  );
}
