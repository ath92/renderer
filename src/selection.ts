import { signal } from "@preact/signals-react";
import { NodeId } from "./csg-tree";

export const selectedNode = signal<NodeId | null>(null);
