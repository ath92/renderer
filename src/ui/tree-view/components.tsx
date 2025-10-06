import { collapsedNodes, toggleNode } from "./state";
import "./style.css";
import {
  Operation,
  csgTree,
  TreeNode,
  OperationTreeNode,
  isOperationNode,
  isLeafNode,
  csgChangeCounter,
} from "../../csg-tree";
import { selectedNode } from "../../selection";
import { MouseEvent, useRef } from "react";

import { TreeID } from "loro-crdt";

const OperationMap: Record<Operation, string> = {
  [Operation.Union]: "Union",
  [Operation.Intersect]: "Intersect",
  [Operation.Difference]: "Difference",
};

function selectedClass(nodeId: string) {
  return nodeId === selectedNode.value ? " selected " : "";
}
function selectNodeHandler(nodeId: TreeID) {
  return (e: MouseEvent) => {
    e.stopPropagation();
    selectedNode.value = nodeId;
  };
}

function LeafNode({ node }: { node: TreeNode }) {
  return (
    <div
      className={`tree-node leaf-node ${selectedClass(node.id)}`}
      onClick={selectNodeHandler(node.id)}
    >
      {node.data.get("name")}
    </div>
  );
}

function OperationNode({ node }: { node: OperationTreeNode }) {
  if (node.data.get("type") !== "operation") return null;
  const isCollapsed = collapsedNodes.value.has(node.id);

  return (
    <div
      className={`tree-node operation-node ${selectedClass(node.id)}`}
      onClick={selectNodeHandler(node.id)}
    >
      <div className="node-details" onClick={() => toggleNode(node.id)}>
        <span>{node.data.get("name")}</span>
        <span className="operation-type">
          {OperationMap[node.data.get("op")]}
        </span>
      </div>
      {!isCollapsed && (
        <div className="children">
          {(node.children() ?? []).map((childNode) => {
            return childNode ? (
              <TreeNodeComponent key={childNode.id} node={childNode} />
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

function TreeNodeComponent({ node }: { node: TreeNode }) {
  if (node.data.get("type") === "leaf") {
    return <LeafNode node={node} />;
  }
  return <OperationNode node={node as OperationTreeNode} />;
}

export function TreeView() {
  const rootNode = csgTree.getRoot();
  console.log("re-render tree!", csgChangeCounter.value);

  if (!rootNode) {
    return <div>No data</div>;
  }

  return (
    <div id="tree-view">
      <TreeNodeComponent node={rootNode} />
    </div>
  );
}

export function SelectedNodeSettings() {
  const selectedNodeId = selectedNode.value;
  if (!selectedNodeId) return null;
  const node = csgTree.tree.getNodeByID(selectedNodeId);
  if (!node) return null;

  return (
    <div>
      <hr></hr>
      <div className="settings-row">
        <h2>Node settings</h2>
      </div>
      {node.data.get("type") === "leaf" ? (
        <LeafNodeSettings id={node.id} />
      ) : (
        <OpNodeSettings id={node.id} />
      )}
    </div>
  );
}

function LeafNodeSettings({ id }: { id: TreeID }) {
  const node = csgTree.getNode(id);
  const radiusInputRef = useRef<HTMLInputElement>(null);
  if (!node) return null;

  function onChange() {
    const input = radiusInputRef.current;
    if (!input) return;

    const value = parseFloat(input.value);
    if (Number.isNaN(value)) return;

    csgTree.updateLeafNodeProperties(node, {
      scale: value,
    });
  }

  if (!isLeafNode(node)) throw new Error("leaf settings rendered for op node");

  return (
    <div>
      <div className="settings-row">
        <span>Radius</span>
        <input
          ref={radiusInputRef}
          step={0.05}
          type="number"
          onChange={onChange}
          value={node.data.get("scale").toFixed(2)}
        />
      </div>
    </div>
  );
}

function OpNodeSettings({ id }: { id: TreeID }) {
  const node = csgTree.getNode(id);
  const smoothingInputRef = useRef<HTMLInputElement>(null);
  const operationInputRef = useRef<HTMLSelectElement>(null);
  if (!node) return null;
  if (!isOperationNode(node))
    throw new Error("op settings rendered for leaf node");

  function onChange() {
    const input = smoothingInputRef.current;
    if (!input) return;

    const value = parseFloat(input.value);
    if (Number.isNaN(value)) return;

    csgTree.updateOperationNodeProperties(node, {
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
    csgTree.updateOperationNodeProperties(node, {
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
          value={node.data.get("smoothing").toFixed(2)}
        />
      </div>
      <div className="settings-row">
        <span>Operation</span>
        <select
          onChange={onChangeOperation}
          ref={operationInputRef}
          value={node.data.get("op")}
        >
          <option value="0">Union</option>
          <option value="1">Difference</option>
          <option value="2">Intersect</option>
        </select>
      </div>
    </div>
  );
}
