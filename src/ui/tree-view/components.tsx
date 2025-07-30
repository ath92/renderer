import { blobTree, collapsedNodes, toggleNode } from "./state";
import "./style.css";
import { SceneNode, Operation } from "../../blob-tree";
import { selectedNode } from "../../selection";

const OperationMap: Record<Operation, string> = {
  [Operation.Union]: "Union",
  [Operation.Intersect]: "Intersect",
  [Operation.Difference]: "Difference",
};

function selectedClass(nodeId: string) {
  return nodeId === selectedNode.value ? " selected " : "";
}
function selectNodeHandler(nodeId: string) {
  return (e: MouseEvent) => {
    e.stopImmediatePropagation();
    selectedNode.value = nodeId;
  };
}

function LeafNode({ node }: { node: SceneNode }) {
  return (
    <div
      class={`tree-node leaf-node ${selectedClass(node.id)}`}
      onClick={selectNodeHandler(node.id)}
    >
      {node.name}
    </div>
  );
}

function OperationNode({ node }: { node: SceneNode }) {
  if (node.type !== "operation") return null;
  const isCollapsed = collapsedNodes.value.has(node.id);

  return (
    <div
      class={`tree-node operation-node ${selectedClass(node.id)}`}
      onClick={selectNodeHandler(node.id)}
    >
      <div class="node-details" onClick={() => toggleNode(node.id)}>
        <span>{node.name}</span>
        <span class="operation-type">{OperationMap[node.op]}</span>
      </div>
      {!isCollapsed && (
        <div class="children">
          {node.children.map((childId: string) => {
            const childNode = blobTree.value.getNode(childId);
            return childNode ? <TreeNode node={childNode} /> : null;
          })}
        </div>
      )}
    </div>
  );
}

function TreeNode({ node }: { node: SceneNode }) {
  if (node.type === "leaf") {
    return <LeafNode node={node} />;
  }
  return <OperationNode node={node} />;
}

export function TreeView() {
  const rootNode = blobTree.value.getRoot();

  if (!rootNode) {
    return <div>No data</div>;
  }

  return (
    <div id="tree-view">
      <TreeNode node={rootNode} />
    </div>
  );
}
