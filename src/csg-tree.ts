import { mat4, vec3 } from "gl-matrix";
import { updateTreeBuffer } from "./main";
import { hasChanges } from "./has-changes";
import { syncSpheres } from "./three-init";

// Using a type alias for the ID for clarity
export type NodeId = string;

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

type OperationParams = {
  op: OperationType; // Use the numerical type
  smoothing: number;
};

type LeafParams = {
  transform: mat4;
  scale: number; // For now, assuming spheres, where scale is the radius
};

// --- AABB Definition ---
type AABB = {
  min: vec3; // [x_min, y_min, z_min]
  max: vec3; // [x_max, y_max, z_max]
};

// --- Node Definitions ---

interface BaseNode {
  id: NodeId;
  name?: string; // Optional name for easier debugging/identification
  parent?: NodeId; // Reference to parent ID
  aabb: AABB; // All nodes will now have an AABB
}

// Operation nodes can have children
interface OperationNode extends BaseNode, OperationParams {
  type: "operation"; // For shader: 0
  children: NodeId[]; // Children will be referenced by their IDs
}

// Leaf nodes cannot have children
interface LeafNode extends BaseNode, LeafParams {
  type: "leaf"; // For shader: 1
  children?: never; // Explicitly disallow children for leaf nodes
}

// Discriminated union for all possible node types
export type CSGNode = OperationNode | LeafNode;

// --- Flattened Node Definition ---
type FlattenedNode = (OperationNode | LeafNode) & {
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
  private nodes: { [key: NodeId]: CSGNode };
  public rootId: NodeId | null;
  private nextId: number;

  constructor() {
    this.nodes = {};
    this.rootId = null;
    this.nextId = 0;
  }

  private generateId(): NodeId {
    /* ... same ... */ return `node-${this.nextId++}`;
  }
  addOperationNode(
    params: Omit<OperationParams, "aabb"> & { name?: string },
    parentId?: NodeId,
  ): OperationNode {
    /* ... same ... */
    const newNode: OperationNode = {
      id: this.generateId(),
      type: "operation",
      children: [],
      aabb: AABB_UTILITIES.create(),
      ...params,
    };
    this.nodes[newNode.id] = newNode;

    if (parentId) {
      this.addChild(parentId, newNode.id);
    } else if (!this.rootId) {
      this.rootId = newNode.id;
    }

    this.updateNodeAABB(newNode.id);
    return newNode;
  }

  addLeafNode(
    params: Omit<LeafParams, "aabb"> & { name?: string },
    parentId: NodeId,
  ): LeafNode {
    /* ... same ... */
    const initialAABB = AABB_UTILITIES.calculateSphereAABB(
      params.transform,
      params.scale,
    );
    const newNode: LeafNode = {
      id: this.generateId(),
      type: "leaf",
      aabb: initialAABB,
      ...params,
    };
    this.nodes[newNode.id] = newNode;
    this.addChild(parentId, newNode.id);

    this.updateNodeAABB(newNode.id);
    return newNode;
  }
  private addChild(parentId: NodeId, childId: NodeId): void {
    /* ... same ... */
    const parentNode = this.nodes[parentId];
    const childNode = this.nodes[childId];

    if (!parentNode) {
      console.warn(
        `Parent node with ID ${parentId} not found. Child ${childId} not added.`,
      );
      delete this.nodes[childId];
      return;
    }
    if (!childNode) {
      console.warn(`Child node with ID ${childId} not found.`);
      return;
    }
    if (parentNode.type === "leaf") {
      console.error(`Cannot add child to a leaf node (ID: ${parentId}).`);
      delete this.nodes[childId];
      return;
    }

    if (!parentNode.children.includes(childId)) {
      parentNode.children.push(childId);
    }
    childNode.parent = parentId;
  }
  removeNode(nodeId: NodeId): void {
    /* ... same ... */
    const nodeToRemove = this.nodes[nodeId];
    if (!nodeToRemove) {
      console.warn(`Node with ID ${nodeId} not found.`);
      return;
    }

    const parentId = nodeToRemove.parent;

    if (nodeToRemove.type === "operation") {
      [...nodeToRemove.children].forEach((childId) => this.removeNode(childId));
    }

    if (parentId) {
      const parentNode = this.nodes[parentId];
      if (parentNode && parentNode.type === "operation") {
        parentNode.children = parentNode.children.filter((id) => id !== nodeId);
      }
    }

    delete this.nodes[nodeId];

    if (this.rootId === nodeId) {
      this.rootId = null;
    }

    if (parentId) {
      this.updateNodeAABB(parentId);
    }
    console.log(`Node ${nodeId} and its descendants removed.`);
  }
  private updateNodeAABB(nodeId: NodeId): void {
    /* ... same ... */
    const node = this.nodes[nodeId];
    if (!node) {
      return;
    }

    let newAABB: AABB;

    if (node.type === "leaf") {
      newAABB = AABB_UTILITIES.calculateSphereAABB(node.transform, node.scale);
    } else {
      newAABB = AABB_UTILITIES.create();

      for (let child_id of node.children) {
        const child = this.getNode(child_id);
        if (!child) throw new Error("child not found");
        AABB_UTILITIES.expandByAABB(newAABB, child.aabb);
      }
      AABB_UTILITIES.expandByScalar(newAABB, node.smoothing * 4);
    }

    node.aabb = newAABB;

    if (node.parent) {
      this.updateNodeAABB(node.parent);
    } else {
      // root
      hasChanges.value = true;
      updateTreeBuffer(this.serializeTreeForWebGPU());
    }
  }
  updateLeafNodeProperties(
    leafId: NodeId,
    newProps: Partial<LeafParams>,
  ): void {
    /* ... same ... */
    const leafNode = this.nodes[leafId];
    if (!leafNode || leafNode.type !== "leaf") {
      console.warn(`Node ${leafId} not found or not a leaf node.`);
      return;
    }

    Object.assign(leafNode, newProps);
    this.updateNodeAABB(leafId);
  }

  updateOperationNodeProperties(
    opId: NodeId,
    newProps: Partial<OperationParams>,
  ): void {
    /* ... same ... */
    const opNode = this.nodes[opId];
    if (!opNode || opNode.type !== "operation") {
      console.warn(`Node ${opId} not found or not a operation node.`);
      return;
    }

    Object.assign(opNode, newProps);
    this.updateNodeAABB(opId);
  }

  getNode(id: NodeId): CSGNode | undefined {
    return this.nodes[id];
  }
  getRoot(): CSGNode | undefined {
    return this.rootId ? this.nodes[this.rootId] : undefined;
  }
  traverse(
    callback: (node: CSGNode, depth: number) => void,
    startNodeId?: NodeId,
    currentDepth: number = 0,
  ): void {
    /* ... same ... */
    const startNode = startNodeId ? this.nodes[startNodeId] : this.getRoot();
    if (!startNode) return;

    callback(startNode, currentDepth);

    if (startNode.type === "operation") {
      for (const childId of startNode.children) {
        this.traverse(callback, childId, currentDepth + 1);
      }
    }
  }

  private getNormalizedTree(): {
    nodes: Map<NodeId, CSGNode>;
    rootId: NodeId | null;
  } {
    if (!this.rootId) {
      return { nodes: new Map(), rootId: null };
    }

    const normalizedNodes = new Map<NodeId, CSGNode>();
    let nextId = 0;
    const generateNormalizedId = () => `norm-${nextId++}`;

    const buildNormalizedTree = (
      originalNodeId: NodeId,
      newParentId?: NodeId,
    ): NodeId => {
      const originalNode = this.nodes[originalNodeId]!;
      const newNode: CSGNode = structuredClone(originalNode);
      newNode.id = generateNormalizedId();
      if (newParentId) {
        newNode.parent = newParentId;
      }
      normalizedNodes.set(newNode.id, newNode);

      if (newNode.type === "operation" && originalNode.type === "operation") {
        newNode.children = originalNode.children.map((childId) =>
          buildNormalizedTree(childId, newNode.id),
        );

        if (newNode.children.length > 2) {
          let currentChildren = [...newNode.children];
          while (currentChildren.length > 2) {
            const newChildrenOfThisLevel = [];
            for (let i = 0; i < currentChildren.length; i += 2) {
              if (i + 1 < currentChildren.length) {
                const intermediateOp: OperationNode = {
                  id: generateNormalizedId(),
                  type: "operation",
                  op: newNode.op,
                  smoothing: newNode.smoothing,
                  name: `${newNode.name} (normalized)`,
                  children: [currentChildren[i], currentChildren[i + 1]],
                  parent: newNode.id,
                  aabb: AABB_UTILITIES.create(),
                };
                normalizedNodes.set(intermediateOp.id, intermediateOp);
                const child1 = normalizedNodes.get(currentChildren[i])!;
                child1.parent = intermediateOp.id;
                const child2 = normalizedNodes.get(currentChildren[i + 1])!;
                child2.parent = intermediateOp.id;
                newChildrenOfThisLevel.push(intermediateOp.id);
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

    const newRootId = buildNormalizedTree(this.rootId);

    const recalculateAABBs = (rootId: NodeId) => {
      const postOrder: NodeId[] = [];
      const buildPostOrder = (nodeId: NodeId) => {
        const node = normalizedNodes.get(nodeId);
        if (!node) return;
        if (node.type === "operation") {
          for (const childId of node.children) {
            buildPostOrder(childId);
          }
        }
        postOrder.push(nodeId);
      };
      buildPostOrder(rootId);

      function getMaxSmoothing(nodeId: NodeId) {
        const node = normalizedNodes.get(nodeId);
        if (!node || node.type === "leaf") return 0;
        let max = node?.smoothing;
        for (let child of node.children) {
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
          for (const childId of node.children) {
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

    if (!normalizedRootId) {
      return [];
    }

    const nodeIndexMap = new Map<NodeId, number>();
    const traversalOrder: CSGNode[] = [];

    const dfs = (nodeId: NodeId) => {
      const node = normalizedNodes.get(nodeId);
      if (!node) return;

      nodeIndexMap.set(nodeId, traversalOrder.length);
      traversalOrder.push(node);

      if (node.type === "operation") {
        for (const childId of node.children) {
          dfs(childId);
        }
      }
    };

    dfs(normalizedRootId);

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
        if (node.type === "operation" && node.children.length > 0) {
          child1 = nodeIndexMap.get(node.children[0]) ?? -1;
          if (node.children.length > 1) {
            child2 = nodeIndexMap.get(node.children[1]) ?? -1;
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

    return buffer;
  }
}

export function generateRandomBlobTree(
  numLeaves: number,
  numChildrenPerNode: number,
): CSGTree {
  const sceneGraph = new CSGTree();
  if (numLeaves <= 0) {
    return sceneGraph;
  }

  const root = sceneGraph.addOperationNode({
    name: "Root",
    op: Operation.Union,
    smoothing: 0.2,
  });

  let parentCandidates: OperationNode[] = [root];
  let leavesCreated = 0;

  while (leavesCreated < numLeaves) {
    if (parentCandidates.length === 0) {
      // This case occurs when all available operation nodes are full.
      // We'll create a new operation node and attach it to a random existing operation node.
      const allOpNodes: OperationNode[] = [];
      sceneGraph.traverse((node) => {
        if (node.type === "operation") {
          allOpNodes.push(node as OperationNode);
        }
      });
      const grandParent =
        allOpNodes[Math.floor(Math.random() * allOpNodes.length)];
      const newParent = sceneGraph.addOperationNode(
        { op: Operation.Union, smoothing: 0.1 },
        grandParent.id,
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
      : vec3.sub(vec3.create(), parent.aabb.max, parent.aabb.min);
    const parent_bbox_center = parent_is_empty
      ? vec3.fromValues(1, 1, 1)
      : vec3.scale(
          vec3.create(),
          vec3.add(vec3.create(), parent.aabb.max, parent.aabb.min),
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
      console.log(
        parent,
        Math.min(
          Math.min(parent_bbox_size[0], parent_bbox_size[1]),
          parent_bbox_size[2],
        ),
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
      sceneGraph.addLeafNode(
        { transform, scale, name: `Leaf-${leavesCreated}` },
        parent.id,
      );
      leavesCreated++;
    } else {
      const newOp = sceneGraph.addOperationNode(
        {
          op: Operation.Difference, //Math.random() > 0.5 ? Operation.Difference : Operation.Union,
          smoothing: Math.random() * 0.25,
        },
        parent.id,
      );
      parentCandidates.push(newOp);
    }

    // Remove parents that are full.
    parentCandidates = parentCandidates.filter(
      (p) => p.children.length < numChildrenPerNode,
    );
  }

  return sceneGraph;
}

export const csgTree = generateRandomBlobTree(15, 5);

console.log(csgTree);
