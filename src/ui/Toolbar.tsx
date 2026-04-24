import { signal, useSignalEffect } from "@preact/signals-react";
import { depthReadback } from "../main";
import { Operation, csgTree } from "../csg-tree";
import { mat4, vec3, vec4 } from "gl-matrix";
import playerControls, { forward } from "../player-controls";
import { hasChanges } from "../has-changes";
import { useState } from "react";

export type Tool = "PlaceSphere";

export const activeTool = signal<Tool | null>(null);

function PlaceSphereTool() {
  const [op, setOp] = useState<`${Operation}`>(`${Operation.Difference}`);

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

      csgTree.addOpLeaf(
        {
          transform: mat4.fromTranslation(mat4.create(), pos),
          scale: 0.1,
          name: "placed node!",
        },
        {
          name: "placed op node!",
          smoothing: 0.05,
          op:
            op === `${Operation.Union}`
              ? Operation.Union
              : Operation.Difference,
        },
      );
    }
    hasChanges.value = true;
    window.addEventListener("click", placeSphere);
    return () => window.removeEventListener("click", placeSphere);
  });

  return (
    <div>
      <select
        value={op}
        onChange={(e) => {
          setOp(e.target.value as "0" | "1");
        }}
      >
        <option value="0">Union</option>
        <option value="1">Difference</option>
      </select>
    </div>
  );
}

export function Toolbar() {
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
      <PlaceSphereTool />
    </div>
  );
}
