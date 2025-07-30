import { signal } from "@preact/signals";
import { NodeId } from "./blob-tree";

export const selectedNode = signal<NodeId | null>(null);
