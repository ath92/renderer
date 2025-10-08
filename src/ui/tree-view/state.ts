import { signal } from "@preact/signals-react";
import { csgTree } from "../../csg-tree";
import { selectedNode } from "../../selection";

const initialCollapsed = new Set();
csgTree.traverse((node) => {
  if (node.data.get("type") === "operation" && node !== csgTree.getRoot()) {
    initialCollapsed.add(node.id);
  }
});

export const collapsedNodes = signal(initialCollapsed);

export function toggleNode(nodeId: string) {
  if (selectedNode.value !== nodeId) return;
  const newSet = new Set(collapsedNodes.value);
  if (newSet.has(nodeId)) {
    newSet.delete(nodeId);
  } else {
    newSet.add(nodeId);
  }
  collapsedNodes.value = newSet;
}
