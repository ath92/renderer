import { signal } from "@preact/signals";
import { sceneGraph } from "../../blob-tree";

export const blobTree = signal(sceneGraph);

const initialCollapsed = new Set();
blobTree.value.traverse((node) => {
  if (node.type === "operation" && node.id !== blobTree.value.rootId) {
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
