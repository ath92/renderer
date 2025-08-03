import { collapsedNodes, csgChangeCounter, toggleNode } from "./state";
import "./style.css";
import { CSGNode, Operation, csgTree, NodeId } from "../../csg-tree";
import { selectedNode } from "../../selection";
import { MouseEvent, useRef } from "react";
import { hasChanges } from "../../has-changes";

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
    e.stopPropagation();
    selectedNode.value = nodeId;
  };
}

function LeafNode({ node }: { node: CSGNode }) {
  return (
    <div
      className={`tree-node leaf-node ${selectedClass(node.id)}`}
      onClick={selectNodeHandler(node.id)}
    >
      {node.name}
    </div>
  );
}

function OperationNode({ node }: { node: CSGNode }) {
  if (node.type !== "operation") return null;
  const isCollapsed = collapsedNodes.value.has(node.id);

  return (
    <div
      className={`tree-node operation-node ${selectedClass(node.id)}`}
      onClick={selectNodeHandler(node.id)}
    >
      <div className="node-details" onClick={() => toggleNode(node.id)}>
        <span>{node.name}</span>
        <span className="operation-type">{OperationMap[node.op]}</span>
      </div>
      {!isCollapsed && (
        <div className="children">
          {node.children.map((childId: string) => {
            const childNode = csgTree.getNode(childId);
            return childNode ? (
              <TreeNode key={childId} node={childNode} />
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

function TreeNode({ node }: { node: CSGNode }) {
  if (node.type === "leaf") {
    return <LeafNode node={node} />;
  }
  return <OperationNode node={node} />;
}

export function TreeView() {
  csgChangeCounter.value;
  const rootNode = csgTree.getRoot();
  console.log("re-render tree!");

  if (!rootNode) {
    return <div>No data</div>;
  }

  return (
    <div id="tree-view" data-bla={hasChanges.value}>
      <TreeNode node={rootNode} />
    </div>
  );
}

export function SelectedNodeSettings() {
  const selectedNodeId = selectedNode.value;
  if (!selectedNodeId) return null;
  const node = csgTree.getNode(selectedNodeId);
  if (!node) return null;

  return (
    <div>
      <hr></hr>
      <div className="settings-row">
        <h2>Node settings</h2>
      </div>
      {node.type === "leaf" ? (
        <LeafNodeSettings id={node.id} />
      ) : (
        <OpNodeSettings id={node.id} />
      )}
    </div>
  );
}

function LeafNodeSettings({ id }: { id: NodeId }) {
  const node = csgTree.getNode(id);
  const radiusInputRef = useRef<HTMLInputElement>(null);
  if (!node) return null;

  function onChange() {
    const input = radiusInputRef.current;
    if (!input) return;

    const value = parseFloat(input.value);
    if (Number.isNaN(value)) return;

    csgTree.updateLeafNodeProperties(id, {
      scale: value,
    });
  }

  if (node.type !== "leaf")
    throw new Error("leaf settings rendered for op node");

  return (
    <div>
      <div className="settings-row">
        <span>Radius</span>
        <input
          ref={radiusInputRef}
          step={0.05}
          type="number"
          onChange={onChange}
          value={node.scale.toFixed(2)}
        />
      </div>
    </div>
  );
}

function OpNodeSettings({ id }: { id: NodeId }) {
  const node = csgTree.getNode(id);
  const smoothingInputRef = useRef<HTMLInputElement>(null);
  const operationInputRef = useRef<HTMLSelectElement>(null);
  if (!node) return null;
  if (node.type !== "operation")
    throw new Error("op settings rendered for leaf node");

  function onChange() {
    const input = smoothingInputRef.current;
    if (!input) return;

    const value = parseFloat(input.value);
    if (Number.isNaN(value)) return;

    csgTree.updateOperationNodeProperties(id, {
      smoothing: value,
    });
  }

  function onChangeOperation() {
    const input = operationInputRef.current;
    if (!input) return;

    let newOperation = Operation.Union;
    // explicit back mapping
    switch (input.value) {
      case "0":
        newOperation = Operation.Union;
        break;
      case "1":
        newOperation = Operation.Difference;
        break;
      case "2":
        newOperation = Operation.Intersect;
        break;
    }
    csgTree.updateOperationNodeProperties(id, {
      op: newOperation,
    });
  }

  return (
    <div>
      <div className="settings-row">
        <span>Smoothing</span>
        <input
          ref={smoothingInputRef}
          step={0.05}
          type="number"
          onChange={onChange}
          value={node.smoothing.toFixed(2)}
        />
      </div>
      <div className="settings-row">
        <span>Operation</span>
        <select
          onChange={onChangeOperation}
          ref={operationInputRef}
          value={node.op}
        >
          <option value="0">Union</option>
          <option value="1">Difference</option>
          <option value="2">Intersect</option>
        </select>
      </div>
    </div>
  );
}
