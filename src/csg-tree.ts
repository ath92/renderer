import {
  Loro,
  LoroTree,
  LoroTreeNode,
  LoroMap,
  LoroDoc,
  TreeID,
} from "loro-crdt";

import { mat4, vec3 } from "gl-matrix";
import { updateTreeBuffer } from "./main";
import { hasChanges } from "./has-changes";

export enum Operation {
  Union = 0, // Assign numerical values for shader
  Intersect = 1,
  Difference = 2,
}

// Ensure these types align with the numeric values assigned in the enum
type OperationType =
  | Operation.Union
  | Operation.Intersect
  | Operation.Difference;

type OperationParams = {};

type LeafParams = {};

// --- AABB Definition ---
type AABB = {
  min: vec3; // [x_min, y_min, z_min]
  max: vec3; // [x_max, y_max, z_max]
};

type BaseNode = {
  aabb: AABB;
};

// Operation nodes can have children
type OperationNode = BaseNode & {
  type: "operation"; // For shader: 0
  name: string;
  op: OperationType; // Use the numerical type
  smoothing: number;
};

// Leaf nodes cannot have children
type LeafNode = BaseNode & {
  type: "leaf"; // For shader: 1
  name: string;
  transform: mat4;
  scale: number; // For now, assuming spheres, where scale is the radius
  children?: never; // Explicitly disallow children for leaf nodes
};

// Discriminated union for all possible node types
export type CSGNode = LeafNode | OperationNode;

export type TreeNode = LoroTreeNode<CSGNode>;

export type OperationTreeNode = LoroTreeNode<OperationNode>;
export type LeafTreeNode = LoroTreeNode<LeafNode>;

type NormalizedTreeNode = CSGNode & {
  id?: TreeID;
  parent?: TreeID;
  children?: TreeID[];
};

// --- Flattened Node Definition ---
type FlattenedNode = CSGNode & {
  child1: number;
  child2: number;
  parentIndex: number;
  flattenedIndex: number;
};

// --- AABB Utility Functions (same as before, no changes needed) ---
const AABB_UTILITIES = {
  create: (): AABB => ({
    min: vec3.fromValues(0, 0, 0),
    max: vec3.fromValues(0, 0, 0),
  }),
  expandByAABB: (aabb: AABB, otherAABB: AABB): AABB => {
    vec3.min(aabb.min, aabb.min, otherAABB.min);
    vec3.max(aabb.max, aabb.max, otherAABB.max);
    return aabb;
  },
  expandByScalar: (aabb: AABB, scalar: number): AABB => {
    vec3.sub(aabb.min, aabb.min, vec3.fromValues(scalar, scalar, scalar));
    vec3.add(aabb.max, aabb.max, vec3.fromValues(scalar, scalar, scalar));
    return aabb;
  },
  calculateSphereAABB: (transform: mat4, radius: number): AABB => {
    const center = vec3.fromValues(transform[12], transform[13], transform[14]);
    const min = vec3.sub(
      vec3.create(),
      center,
      vec3.fromValues(radius, radius, radius),
    );
    const max = vec3.add(
      vec3.create(),
      center,
      vec3.fromValues(radius, radius, radius),
    );
    return { min, max };
  },
};

export class CSGTree {
  doc: LoroDoc;
  tree: LoroTree;
  root: LoroTreeNode;
  constructor() {
    this.doc = new LoroDoc();
    this.tree = this.doc.getTree("csg-tree");
    this.root = this.addOperationNode({
      op: Operation.Union,
      name: "root",
      smoothing: 0,
    });
  }

  addOperationNode(
    params: Omit<OperationNode, "aabb" | "type">,
    parent?: LoroTreeNode,
  ): LoroTreeNode<OperationNode> {
    /* ... same ... */
    const newNode: OperationNode = {
      type: "operation",
      aabb: AABB_UTILITIES.create(),
      ...params,
    };

    const nodeParent = parent ?? this.root ?? this.tree;

    const node = nodeParent.createNode();
    Object.entries(newNode).forEach(([key, value]) => {
      node.data.set(key, value);
    });

    this.updateNodeAABB(node as TreeNode);
    return node as LoroTreeNode<OperationNode>;
  }

  addLeafNode(
    params: Omit<LeafNode, "aabb" | "type">,
    parent: LoroTreeNode,
  ): LoroTreeNode<LeafNode> {
    /* ... same ... */
    const initialAABB = AABB_UTILITIES.calculateSphereAABB(
      params.transform,
      params.scale,
    );

    console.log("transform", params.transform);

    const newNode: LeafNode = {
      type: "leaf",
      aabb: initialAABB,
      ...params,
      transform: [...params.transform] as mat4,
    };
    const node = parent.createNode();
    Object.entries(newNode).forEach(([key, value]) => {
      node.data.set(key, value);
    });

    console.log(node.data.get("transform"));

    this.updateNodeAABB(node as TreeNode);
    return node as LoroTreeNode<LeafNode>;
  }
  removeNode(node: TreeNode): void {
    const parent = node.parent();
    this.tree.delete(node.id);

    if (parent) {
      this.updateNodeAABB(parent);
    }
  }
  private updateNodeAABB(node: TreeNode): void {
    let newAABB: AABB;

    // TODO: Parse?

    if (node.data.get("type") === "leaf") {
      const nodeData = node.data as LoroMap<LeafNode>;
      newAABB = AABB_UTILITIES.calculateSphereAABB(
        nodeData.get("transform"),
        nodeData.get("scale"),
      );
    } else {
      const nodeData = node.data as LoroMap<OperationNode>;
      newAABB = AABB_UTILITIES.create();

      for (let child of node.children() ?? []) {
        if (!child) throw new Error("child not found");
        const childData = child.data;
        AABB_UTILITIES.expandByAABB(newAABB, childData.get("aabb"));
      }
      AABB_UTILITIES.expandByScalar(newAABB, nodeData.get("smoothing") * 4);
    }

    node.data.set("aabb", newAABB);

    const parent = node.parent();
    if (parent) {
      this.updateNodeAABB(parent);
    } else {
      // root
      hasChanges.value = true;
    }
  }
  updateLeafNodeProperties(
    leafNode: TreeNode,
    newProps: Partial<LeafParams>,
  ): void {
    const leafNodeData = leafNode.data;
    if (!leafNodeData || leafNodeData.get("type") !== "leaf") {
      return;
    }

    Object.assign(leafNode, newProps);
    this.updateNodeAABB(leafNode);
  }

  updateOperationNodeProperties(
    opNode: LoroTreeNode, // TODO: type guard so this can only be op node
    newProps: Partial<OperationParams>,
  ): void {
    Object.entries(newProps).forEach(([key, value]) => {
      opNode.data.set(key, value);
    });
    this.updateNodeAABB(opNode as LoroTreeNode<OperationNode>);
  }

  getRoot(): LoroTreeNode<OperationNode> {
    return this.root as LoroTreeNode<OperationNode>;
  }

  getNode(id: TreeID) {
    return this.tree.getNodeByID(id) as TreeNode;
  }

  traverse(
    callback: (node: TreeNode, depth: number) => void,
    startTreeNode?: TreeNode,
    currentDepth: number = 0,
  ): void {
    /* ... same ... */
    const startNode = startTreeNode ?? this.getRoot();
    if (!startNode) return;

    callback(startNode, currentDepth);

    if (startNode.data.get("type") === "operation") {
      for (const childId of startNode.children() ?? []) {
        this.traverse(callback, childId, currentDepth + 1);
      }
    }
  }

  private getNormalizedTree(): {
    nodes: Map<TreeID, NormalizedTreeNode>;
    rootId: TreeID | null;
  } {
    const normalizedNodes = new Map<TreeID, NormalizedTreeNode>();
    let nextId = 0;
    const generateNormalizedId = (): TreeID => `999@${nextId++}`;

    const buildNormalizedTree = (
      originalNodeId: TreeID,
      newParentId?: TreeID,
    ): LoroTreeNode["id"] => {
      const originalNode = this.tree.getNodeByID(originalNodeId) as TreeNode;

      const newNode: NormalizedTreeNode = structuredClone(
        originalNode.data.toJSON(),
      );

      newNode.id = originalNode.id;
      if (newParentId) {
        newNode.parent = newParentId;
      }
      normalizedNodes.set(newNode.id, newNode);

      if (
        newNode.type === "operation" &&
        originalNode.data.get("type") === "operation"
      ) {
        newNode.children = (originalNode.children() ?? []).map((child) =>
          buildNormalizedTree(child.id, newNode.id),
        );

        if (newNode.children.length > 2) {
          let currentChildren = [...newNode.children];
          while (currentChildren.length > 2) {
            const newChildrenOfThisLevel: TreeID[] = [];
            for (let i = 0; i < currentChildren.length; i += 2) {
              if (i + 1 < currentChildren.length) {
                const intermediateOp: NormalizedTreeNode = {
                  id: generateNormalizedId(),
                  type: "operation",
                  op: newNode.op,
                  smoothing: newNode.smoothing,
                  name: `${newNode.name} (normalized)`,
                  children: [currentChildren[i], currentChildren[i + 1]],
                  parent: newNode.id,
                  aabb: AABB_UTILITIES.create(),
                };
                normalizedNodes.set(intermediateOp.id!, intermediateOp);
                const child1 = normalizedNodes.get(currentChildren[i])!;
                child1.parent = intermediateOp.id!;
                const child2 = normalizedNodes.get(currentChildren[i + 1])!;
                child2.parent = intermediateOp.id!;
                newChildrenOfThisLevel.push(intermediateOp.id!);
              } else {
                newChildrenOfThisLevel.push(currentChildren[i]);
              }
            }
            currentChildren = newChildrenOfThisLevel;
          }
          newNode.children = currentChildren;
        }
      }
      return newNode.id;
    };

    const newRootId = buildNormalizedTree(this.root.id);

    const recalculateAABBs = (rootId: TreeID) => {
      const postOrder: TreeID[] = [];
      const buildPostOrder = (nodeId: TreeID) => {
        const node = normalizedNodes.get(nodeId);
        if (!node) return;
        if (node.type === "operation") {
          for (const childId of node.children ?? []) {
            buildPostOrder(childId);
          }
        }
        postOrder.push(nodeId);
      };
      buildPostOrder(rootId);

      function getMaxSmoothing(nodeId: TreeID) {
        const node = normalizedNodes.get(nodeId);
        if (!node || node.type === "leaf") return 0;
        let max = node?.smoothing;
        for (let child of node.children ?? []) {
          max = Math.max(getMaxSmoothing(child), max);
        }
        return max;
      }

      for (const nodeId of postOrder) {
        const node = normalizedNodes.get(nodeId)!;
        let newAABB: AABB;
        if (node.type === "leaf") {
          newAABB = AABB_UTILITIES.calculateSphereAABB(
            node.transform,
            node.scale,
          );
        } else {
          newAABB = AABB_UTILITIES.create();
          for (const childId of node.children ?? []) {
            const child = normalizedNodes.get(childId)!;
            AABB_UTILITIES.expandByAABB(newAABB, child.aabb);
          }
          AABB_UTILITIES.expandByScalar(newAABB, getMaxSmoothing(rootId) * 4);
        }
        node.aabb = newAABB;
      }
    };

    recalculateAABBs(newRootId);

    return { nodes: normalizedNodes, rootId: newRootId };
  }

  flattenTree(): FlattenedNode[] {
    const { nodes: normalizedNodes, rootId: normalizedRootId } =
      this.getNormalizedTree();

    console.log("normalized", normalizedNodes);

    if (!normalizedRootId) {
      return [];
    }

    const nodeIndexMap = new Map<TreeID, number>();
    const traversalOrder: NormalizedTreeNode[] = [];

    const dfs = (nodeId: TreeID) => {
      const node = normalizedNodes.get(nodeId);
      if (!node) return;

      nodeIndexMap.set(nodeId, traversalOrder.length);
      traversalOrder.push(node);

      if (node.type === "operation") {
        for (const childId of node.children ?? []) {
          dfs(childId);
        }
      }
    };

    dfs(normalizedRootId);

    console.log("tra", traversalOrder);

    const flattenedNodes: FlattenedNode[] = traversalOrder.map(
      (node, index) => {
        const flattenedIndex = index;

        let parentIndex = -1;
        if (node.parent) {
          const pIndex = nodeIndexMap.get(node.parent);
          if (pIndex !== undefined) {
            parentIndex = pIndex;
          }
        }

        let child1 = -1;
        let child2 = -1;
        if (node.type === "operation" && (node.children ?? []).length > 0) {
          child1 = nodeIndexMap.get((node.children ?? [])[0]) ?? -1;
          if ((node.children ?? []).length > 1) {
            child2 = nodeIndexMap.get((node.children ?? [])[1]) ?? -1;
          }
        }

        return {
          ...node,
          child1,
          child2,
          parentIndex,
          flattenedIndex,
        };
      },
    );

    console.log("flattened", flattenedNodes);

    return flattenedNodes;
  }

  /**
   * Serializes a single FlattenedNode into a Float32Array following WebGPU alignment rules.
   * Each node will take up 16 * 4 = 64 bytes (16 floats).
   *
   * @param node The FlattenedNode to serialize.
   * @returns A Float32Array representing the node's data for the shader.
   */
  public static serializeFlattenedNode(node: FlattenedNode): Float32Array {
    const nodeSizeInFloats_Revised = 32;
    const dataRevised = new Float32Array(nodeSizeInFloats_Revised);
    let currentOffset = 0;

    // 1. type_op_data1: vec4<f32> (4 floats) - Offset 0
    dataRevised[currentOffset++] = node.type === "operation" ? 0 : 1; // Node type
    if (node.type === "operation") {
      dataRevised[currentOffset++] = node.op; // Operation enum value
      dataRevised[currentOffset++] = node.smoothing; // Smoothing value
      dataRevised[currentOffset++] = 0; // Padding
    } else {
      // type === "leaf"
      dataRevised[currentOffset++] = node.scale; // Sphere radius
      dataRevised[currentOffset++] = 0; // Padding
      dataRevised[currentOffset++] = 0; // Padding
    }

    // 2. aabb_min: vec4<f32> (4 floats) - Offset 4 (16 bytes)
    dataRevised[currentOffset++] = node.aabb.min[0];
    dataRevised[currentOffset++] = node.aabb.min[1];
    dataRevised[currentOffset++] = node.aabb.min[2];
    dataRevised[currentOffset++] = 0; // Padding

    // 3. aabb_max: vec4<f32> (4 floats) - Offset 8 (32 bytes)
    dataRevised[currentOffset++] = node.aabb.max[0];
    dataRevised[currentOffset++] = node.aabb.max[1];
    dataRevised[currentOffset++] = node.aabb.max[2];
    dataRevised[currentOffset++] = 0; // Padding

    // 4. tree_indices: vec4<f32> (4 floats) - Offset 12 (48 bytes)
    // REPURPOSED: x: child1, y: child2, z: parent, w: flattenedIndex
    dataRevised[currentOffset++] = node.child1;
    dataRevised[currentOffset++] = node.child2;
    dataRevised[currentOffset++] = node.parentIndex;
    dataRevised[currentOffset++] = node.flattenedIndex;

    // 5. model_matrix: mat4x4<f32> (16 floats) - Offset 16 (64 bytes)
    const transformMatrix =
      node.type === "leaf" ? node.transform : mat4.identity(mat4.create());
    dataRevised.set(transformMatrix, currentOffset);
    currentOffset += 16; // Advance offset by 16 floats for the mat4

    console.log("revised", dataRevised);

    if (currentOffset !== nodeSizeInFloats_Revised) {
      console.error(
        `Serialization error: Expected ${nodeSizeInFloats_Revised} floats, got ${currentOffset}`,
      );
    }

    return dataRevised;
  }

  /**
   * Serializes the entire flattened tree into a single large Float32Array
   * suitable for a WebGPU storage or uniform buffer.
   *
   * @returns A Float32Array containing all serialized nodes.
   */
  public serializeTreeForWebGPU(): Float32Array {
    const flattenedTree = this.flattenTree();
    if (flattenedTree.length === 0) {
      return new Float32Array(0);
    }

    // Determine the size of each node in floats (should match serializeFlattenedNode)
    // We determined it to be 32 floats per node.
    const nodeStrideInFloats = 32;
    const totalSizeInFloats = flattenedTree.length * nodeStrideInFloats;
    const buffer = new Float32Array(totalSizeInFloats);

    flattenedTree.forEach((node, index) => {
      const serializedNodeData = CSGTree.serializeFlattenedNode(node);
      buffer.set(serializedNodeData, index * nodeStrideInFloats);
    });

    console.log(buffer, "buf");

    return buffer;
  }
}

export const isOperationNode = (node: TreeNode): node is OperationTreeNode =>
  node.data.get("type") === "operation";
export const isLeafNode = (node: TreeNode): node is LeafTreeNode =>
  node.data.get("type") === "leaf";

export function generateRandomBlobTree(
  numLeaves: number,
  numChildrenPerNode: number,
): CSGTree {
  const csgTree = new CSGTree();
  if (numLeaves <= 0) {
    return csgTree;
  }

  let parentCandidates: LoroTreeNode<OperationNode>[] = [csgTree.getRoot()];
  let leavesCreated = 0;
  let opNodesCreated = 0;

  while (leavesCreated < numLeaves) {
    if (parentCandidates.length === 0) {
      // This case occurs when all available operation nodes are full.
      // We'll create a new operation node and attach it to a random existing operation node.
      const allOpNodes: TreeNode[] = [];
      csgTree.traverse((node) => {
        if (node.data.get("type") === "operation") {
          allOpNodes.push(node);
        }
      });
      const grandParent =
        allOpNodes[Math.floor(Math.random() * allOpNodes.length)];
      const newParent = csgTree.addOperationNode(
        {
          op: Operation.Union,
          smoothing: 0.1,
          name: `opNode ${opNodesCreated++}`,
        },
        grandParent,
      );
      parentCandidates.push(newParent);
    }

    const parent =
      parentCandidates[Math.floor(Math.random() * parentCandidates.length)];

    // Decide whether to add a leaf or another operation node.
    // We'll add a leaf if we're running out of leaves to create, or just by chance.
    const shouldAddLeaf =
      Math.random() < 0.75 ||
      parentCandidates.length >= numLeaves - leavesCreated;

    const parent_is_empty = parent.children.length === 0;

    const parent_bbox_size = parent_is_empty
      ? vec3.fromValues(2, 2, 2)
      : vec3.sub(
          vec3.create(),
          parent.data.get("aabb").max,
          parent.data.get("aabb").min,
        );
    const parent_bbox_center = parent_is_empty
      ? vec3.fromValues(1, 1, 1)
      : vec3.scale(
          vec3.create(),
          vec3.add(
            vec3.create(),
            parent.data.get("aabb").max,
            parent.data.get("aabb").min,
          ),
          0.5,
        );

    // console.log(parent_is_empty, parent, parent_bbox_size, parent_bbox_center);
    if (shouldAddLeaf) {
      const position = vec3.fromValues(
        (Math.random() - 0.5) * 1.2 * parent_bbox_size[0] +
          parent_bbox_center[0],
        (Math.random() - 0.5) * 1.2 * parent_bbox_size[1] +
          parent_bbox_center[1],
        (Math.random() - 0.5) * 1.2 * parent_bbox_size[2] +
          parent_bbox_center[2],
      );
      const scale =
        Math.random() *
          Math.min(
            Math.min(parent_bbox_size[0], parent_bbox_size[1]),
            parent_bbox_size[2],
          ) *
          0.5 +
        0.1;
      const transform = mat4.fromTranslation(mat4.create(), position);
      csgTree.addLeafNode(
        { transform, scale, name: `Leaf-${leavesCreated}` },
        parent,
      );
      leavesCreated++;
    } else {
      const newOp = csgTree.addOperationNode(
        {
          name: `op_${opNodesCreated++}`,
          op: Operation.Difference, //Math.random() > 0.5 ? Operation.Difference : Operation.Union,
          smoothing: Math.random() * 0.25,
        },
        parent,
      );
      parentCandidates.push(newOp);
    }

    // Remove parents that are full.
    parentCandidates = parentCandidates.filter(
      (p) => p.children.length < numChildrenPerNode,
    );
  }

  return csgTree;
}

export const csgTree = generateRandomBlobTree(3, 5);

console.log("json", csgTree.tree.toJSON());
