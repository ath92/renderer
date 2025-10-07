import { signal, useSignalEffect } from "@preact/signals-react";
import { depthReadback } from "../main";
import { Operation, csgTree } from "../csg-tree";
import { mat4, vec3, vec4 } from "gl-matrix";
import playerControls from "../player-controls";
import { hasChanges } from "../has-changes";
import "./style.css";

export type Tool = "PlaceSphere";

export const activeTool = signal<Tool | null>("PlaceSphere");
const op = signal<`${Operation}`>(`${Operation.Union}`);
const sphereScale = signal<"small" | "medium" | "large">("medium");

function PlaceSphereTool() {
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

      let scale: number;
      switch (sphereScale.value) {
        case "small":
          scale = 0.05;
          break;
        case "medium":
          scale = 0.1;
          break;
        case "large":
          scale = 0.2;
          break;
      }

      csgTree.addOpLeaf(
        {
          transform: mat4.fromTranslation(mat4.create(), pos),
          scale,
          name: "placed node!",
        },
        {
          name: "placed op node!",
          smoothing: 0.5 * scale,
          op:
            op.value === `${Operation.Union}`
              ? Operation.Union
              : Operation.Difference,
        },
      );
    }
    hasChanges.value = true;
    const canvasEl = document.querySelector(
      "canvas:not(#webgpu-canvas)",
    ) as HTMLCanvasElement;
    if (!canvasEl) return;
    canvasEl.addEventListener("click", placeSphere);
    return () => canvasEl.removeEventListener("click", placeSphere);
  });

  return null;
}

export function Toolbar() {
  const isPlusActive =
    activeTool.peek() === "PlaceSphere" && op.value === `${Operation.Union}`;
  const isMinusActive =
    activeTool.peek() === "PlaceSphere" &&
    op.value === `${Operation.Difference}`;

  return (
    <div className="toolbar">
      <button
        className="tool-btn"
        data-active={isPlusActive}
        onClick={() => {
          activeTool.value = isPlusActive ? null : "PlaceSphere";
          op.value = `${Operation.Union}`;
        }}
      >
        +
      </button>
      <button
        className="tool-btn"
        data-active={isMinusActive}
        onClick={() => {
          activeTool.value = isMinusActive ? null : "PlaceSphere";
          op.value = `${Operation.Difference}`;
        }}
      >
        -
      </button>
      <div className="sphere-scale-toolbar">
        <button
          className="tool-btn"
          data-active={sphereScale.value === "small"}
          onClick={() => (sphereScale.value = "small")}
        >
          S
        </button>
        <button
          className="tool-btn"
          data-active={sphereScale.value === "medium"}
          onClick={() => (sphereScale.value = "medium")}
        >
          M
        </button>
        <button
          className="tool-btn"
          data-active={sphereScale.value === "large"}
          onClick={() => (sphereScale.value = "large")}
        >
          L
        </button>
      </div>
      <PlaceSphereTool />
    </div>
  );
}
