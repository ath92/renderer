import { signal, useSignalEffect } from "@preact/signals-react";
import { useSignals } from "@preact/signals-react/runtime";
import { depthReadback } from "../main";
import { csgTree } from "../csg-tree";
import { mat4, vec3 } from "gl-matrix";
import playerControls, { forward } from "../player-controls";

export type Tool = "PlaceSphere";

export const activeTool = signal<Tool | null>(null);

function usePlaceSphereTool() {
  useSignalEffect(() => {
    if (activeTool.value !== "PlaceSphere") return;
    console.log("placeing!");
    async function placeSphere(e: MouseEvent) {
      const x = e.clientX;
      const y = e.clientY;

      const depth = await depthReadback(x, y);
      const dir = vec3.transformMat4(
        vec3.create(),
        forward,
        playerControls.state.cameraDirection,
      );
      const pos = vec3.add(
        vec3.create(),
        playerControls.state.cameraPosition,
        vec3.scale(vec3.create(), dir, depth),
      );
      csgTree.addLeafNode(
        {
          transform: mat4.fromTranslation(mat4.create(), pos),
          scale: 1,
        },
        csgTree.rootId!,
      );
    }
    window.addEventListener("click", placeSphere);
    return () => window.removeEventListener("click", placeSphere);
  });
}

export function Toolbar() {
  useSignals();
  usePlaceSphereTool();

  return (
    <div>
      <hr></hr>
      <button
        onClick={() => {
          console.log("click");
          activeTool.value = "PlaceSphere";
        }}
      >
        place sphere {activeTool.value === "PlaceSphere" ? "!" : ""}
      </button>
    </div>
  );
}
