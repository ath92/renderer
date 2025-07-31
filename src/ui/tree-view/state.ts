import { effect, signal } from "@preact/signals";
import { csgTree } from "../../csg-tree";
import { hasChanges } from "../../has-changes";

export const csgChangeCounter = signal(0);

effect(() => {
  if (hasChanges.value) {
    csgChangeCounter.value = csgChangeCounter.peek() + 1;
  }
});

const initialCollapsed = new Set();
csgTree.traverse((node) => {
  if (node.type === "operation" && node.id !== csgTree.rootId) {
    initialCollapsed.add(node.id);
  }
});

export const collapsedNodes = signal(initialCollapsed);

export function toggleNode(nodeId: string) {
  const newSet = new Set(collapsedNodes.value);
  if (newSet.has(nodeId)) {
    newSet.delete(nodeId);
  } else {
    newSet.add(nodeId);
  }
  collapsedNodes.value = newSet;
}
