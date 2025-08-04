import { signal, useSignalEffect } from "@preact/signals-react";
import { depthReadback } from "../main";
import { csgTree } from "../csg-tree";
import { mat4, vec3, vec4 } from "gl-matrix";
import playerControls, { forward } from "../player-controls";
import { hasChanges } from "../has-changes";

export type Tool = "PlaceSphere";

export const activeTool = signal<Tool | null>(null);

function usePlaceSphereTool() {
  useSignalEffect(() => {
    if (activeTool.value !== "PlaceSphere") return;
    async function placeSphere(e: MouseEvent) {
      const x = e.clientX;
      const y = e.clientY;

      const depth = await depthReadback(x, y);

      const pixelX =
        (x - window.innerWidth / 2) /
        Math.min(window.innerWidth, window.innerHeight);
      const pixelY =
        (y - window.innerHeight / 2) /
        Math.min(window.innerWidth, window.innerHeight);

      const rayDirectionVec4 = vec4.fromValues(pixelX, -pixelY, 1.0, 0.0);
      const transformedDir = vec4.transformMat4(
        vec4.create(),
        rayDirectionVec4,
        playerControls.state.cameraDirection,
      );
      const dir = vec3.normalize(
        vec3.create(),
        vec3.fromValues(
          transformedDir[0],
          transformedDir[1],
          transformedDir[2],
        ),
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
          name: "placed node!",
        },
        csgTree.rootId!,
      );
    }
    hasChanges.value = true;
    window.addEventListener("click", placeSphere);
    return () => window.removeEventListener("click", placeSphere);
  });
}

export function Toolbar() {
  usePlaceSphereTool();

  return (
    <div>
      <hr></hr>
      <button
        onClick={() => {
          activeTool.value =
            activeTool.peek() === "PlaceSphere" ? null : "PlaceSphere";
        }}
      >
        place sphere {activeTool.value === "PlaceSphere" ? "!" : ""}
      </button>
    </div>
  );
}
