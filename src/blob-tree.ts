import { mat4, vec3 } from "gl-matrix";

// Using a type alias for the ID for clarity
type NodeId = string;

enum Operation {
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
type SceneNode = OperationNode | LeafNode;

// --- Flattened Node Definition ---
type FlattenedNode = SceneNode & {
  entry: number; // Index of the first child in the flattened array (-1 if no children)
  exit: number; // Index of the next sibling in the flattened array (-1 if no next sibling)
  // We might also add the original index in the flattened array itself for convenience
  flattenedIndex: number;
};

// --- AABB Utility Functions (same as before, no changes needed) ---
const AABB_UTILITIES = {
  create: (): AABB => ({
    min: vec3.fromValues(Infinity, Infinity, Infinity),
    max: vec3.fromValues(-Infinity, -Infinity, -Infinity),
  }),
  expandByAABB: (aabb: AABB, otherAABB: AABB): AABB => {
    vec3.min(aabb.min, aabb.min, otherAABB.min);
    vec3.max(aabb.max, aabb.max, otherAABB.max);
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

// --- Tree Management Class (Previous methods omitted for brevity, assume they are still there) ---

class SceneGraph {
  private nodes: Map<NodeId, SceneNode>;
  private rootId: NodeId | null;
  private nextId: number;

  constructor() {
    this.nodes = new Map();
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
    this.nodes.set(newNode.id, newNode);

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
    this.nodes.set(newNode.id, newNode);
    this.addChild(parentId, newNode.id);

    this.updateNodeAABB(newNode.id);
    return newNode;
  }
  private addChild(parentId: NodeId, childId: NodeId): void {
    /* ... same ... */
    const parentNode = this.nodes.get(parentId);
    const childNode = this.nodes.get(childId);

    if (!parentNode) {
      console.warn(
        `Parent node with ID ${parentId} not found. Child ${childId} not added.`,
      );
      this.nodes.delete(childId);
      return;
    }
    if (!childNode) {
      console.warn(`Child node with ID ${childId} not found.`);
      return;
    }
    if (parentNode.type === "leaf") {
      console.error(`Cannot add child to a leaf node (ID: ${parentId}).`);
      this.nodes.delete(childId);
      return;
    }

    if (!parentNode.children.includes(childId)) {
      parentNode.children.push(childId);
    }
    childNode.parent = parentId;
  }
  removeNode(nodeId: NodeId): void {
    /* ... same ... */
    const nodeToRemove = this.nodes.get(nodeId);
    if (!nodeToRemove) {
      console.warn(`Node with ID ${nodeId} not found.`);
      return;
    }

    const parentId = nodeToRemove.parent;

    if (nodeToRemove.type === "operation") {
      [...nodeToRemove.children].forEach((childId) => this.removeNode(childId));
    }

    if (parentId) {
      const parentNode = this.nodes.get(parentId);
      if (parentNode && parentNode.type === "operation") {
        parentNode.children = parentNode.children.filter((id) => id !== nodeId);
      }
    }

    this.nodes.delete(nodeId);

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
    const node = this.nodes.get(nodeId);
    if (!node) {
      return;
    }

    let newAABB: AABB;

    if (node.type === "leaf") {
      newAABB = AABB_UTILITIES.calculateSphereAABB(node.transform, node.scale);
    } else {
      newAABB = AABB_UTILITIES.create();
      let hasChildrenWithAABB = false;

      this.traverse((descendantNode) => {
        if (descendantNode.type === "leaf") {
          AABB_UTILITIES.expandByAABB(newAABB, descendantNode.aabb);
          hasChildrenWithAABB = true;
        }
      }, nodeId);

      if (!hasChildrenWithAABB) {
        newAABB = AABB_UTILITIES.create();
      }
    }

    node.aabb = newAABB;

    if (node.parent) {
      this.updateNodeAABB(node.parent);
    }
  }
  updateLeafNodeProperties(
    leafId: NodeId,
    newProps: Partial<LeafParams>,
  ): void {
    /* ... same ... */
    const leafNode = this.nodes.get(leafId);
    if (!leafNode || leafNode.type !== "leaf") {
      console.warn(`Node ${leafId} not found or not a leaf node.`);
      return;
    }

    Object.assign(leafNode, newProps);
    this.updateNodeAABB(leafId);
  }
  getNode(id: NodeId): SceneNode | undefined {
    return this.nodes.get(id);
  }
  getRoot(): SceneNode | undefined {
    return this.rootId ? this.nodes.get(this.rootId) : undefined;
  }
  traverse(
    callback: (node: SceneNode, depth: number) => void,
    startNodeId?: NodeId,
    currentDepth: number = 0,
  ): void {
    /* ... same ... */
    const startNode = startNodeId
      ? this.nodes.get(startNodeId)
      : this.getRoot();
    if (!startNode) return;

    callback(startNode, currentDepth);

    if (startNode.type === "operation") {
      for (const childId of startNode.children) {
        this.traverse(callback, childId, currentDepth + 1);
      }
    }
  }

  /**
   * Constructs a flattened version of the tree with 'entry', 'exit', and 'flattenedIndex' indices.
   * The 'entry' index points to the first child's position in the flattened array.
   * The 'exit' index points to the next sibling's position in the flattened array.
   * If no child/sibling, it's -1.
   */
  flattenTree(): FlattenedNode[] {
    const flattenedNodes: FlattenedNode[] = [];
    if (!this.rootId) {
      return flattenedNodes;
    }

    const nodeIndexMap = new Map<NodeId, number>();
    const traversalOrder: { nodeId: NodeId; originalNode: SceneNode }[] = [];

    let currentIndex = 0;
    const dfs = (nodeId: NodeId) => {
      const node = this.nodes.get(nodeId);
      if (!node) return;

      nodeIndexMap.set(nodeId, currentIndex++);
      traversalOrder.push({ nodeId, originalNode: node });

      if (node.type === "operation") {
        for (const childId of node.children) {
          dfs(childId);
        }
      }
    };

    dfs(this.rootId);

    for (const { nodeId, originalNode } of traversalOrder) {
      let entry = -1;
      let exit = -1;
      const flattenedIndex = nodeIndexMap.get(nodeId)!; // Store its own flattened index

      if (
        originalNode.type === "operation" &&
        originalNode.children.length > 0
      ) {
        entry = nodeIndexMap.get(originalNode.children[0])!;
      }

      if (originalNode.parent) {
        const parentNode = this.nodes.get(originalNode.parent);
        if (parentNode && parentNode.type === "operation") {
          const siblings = parentNode.children;
          const selfIndexInSiblings = siblings.indexOf(nodeId);
          if (
            selfIndexInSiblings !== -1 &&
            selfIndexInSiblings < siblings.length - 1
          ) {
            exit = nodeIndexMap.get(siblings[selfIndexInSiblings + 1])!;
          }
        }
      }

      flattenedNodes.push({
        ...originalNode,
        entry,
        exit,
        flattenedIndex, // Add the flattened index here
      });
    }

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
    // We'll use 16 floats (64 bytes) per node to ensure mat4 alignment
    // and overall consistent stride for an array of structs.
    const nodeSizeInFloats = 16;
    const data = new Float32Array(nodeSizeInFloats);
    let offset = 0; // Current offset in floats

    // 1. type_op_id_padding: vec4<f32> (4 floats) - Offset 0
    // x: type (0=op, 1=leaf)
    // y: operation (Union=0, Intersect=1, Difference=2) OR scale (for leaf)
    // z: smoothing (for op) OR padding (for leaf)
    // w: padding (always)
    data[offset++] = node.type === "operation" ? 0 : 1;
    if (node.type === "operation") {
      data[offset++] = node.op;
      data[offset++] = node.smoothing;
      data[offset++] = 0; // padding
    } else {
      // type === "leaf"
      data[offset++] = node.scale;
      data[offset++] = 0; // padding
      data[offset++] = 0; // padding
    }

    // 2. aabb_min: vec4<f32> (4 floats) - Offset 4 (16 bytes)
    data[offset++] = node.aabb.min[0];
    data[offset++] = node.aabb.min[1];
    data[offset++] = node.aabb.min[2];
    data[offset++] = 0; // padding for vec4 alignment

    // 3. aabb_max: vec4<f32> (4 floats) - Offset 8 (32 bytes)
    data[offset++] = node.aabb.max[0];
    data[offset++] = node.aabb.max[1];
    data[offset++] = node.aabb.max[2];
    data[offset++] = 0; // padding for vec4 alignment

    // 4. entry_exit_padding: vec4<f32> (4 floats) - Offset 12 (48 bytes)
    data[offset++] = node.entry;
    data[offset++] = node.exit;
    data[offset++] = 0; // padding
    data[offset++] = 0; // padding

    // 5. transform_mat4: mat4x4<f32> (16 floats).
    // Note: GL-Matrix stores in column-major order, but we often think row-major.
    // When copying to a flat array, it doesn't matter as much, as long as shader matches.
    // If you need to treat it as row-major in the shader, copy column by column for GL-Matrix.
    // Here, we'll assume a standard flattened matrix for the shader.
    // For mat4x4, it occupies 4 * vec4, so it needs to start on a 16-byte boundary.
    // Our previous vec4 makes this naturally aligned.
    // Current offset is 16 (64 bytes).
    // The previous design was 4 vec4s, ending at offset 15, so 16 is next
    // No, current offset is 12. So it will be at index 12.

    // A mat4x4<f32> is 16 floats, so it will occupy indices 12-27.
    // Oh, my WGSL struct example above was 4 vec4s (16 floats) for the transform.
    // My previous offsets are correct up to 'entry_exit_padding', which ends at index 15.
    // So the transform starts at index 16. This is perfect for mat4x4.

    // Let's re-evaluate the total size and alignment.
    // type_op_id_padding: vec4<f32> (0-3) - Size 16 bytes
    // aabb_min: vec4<f32> (4-7) - Size 16 bytes
    // aabb_max: vec4<f32> (8-11) - Size 16 bytes
    // entry_exit_padding: vec4<f32> (12-15) - Size 16 bytes
    // Total so far: 16 floats = 64 bytes.

    // For the mat4, we need 16 floats.
    // If the mat4 comes AFTER these 4 vec4s, it naturally aligns.
    // So total size should be (4+4+4+4+16) = 32 floats.

    // Let's redefine the WGSL struct and then the serialization.
    // This will make it more robust.

    // --- REVISED WGSL Struct Plan ---
    // struct Node {
    //     type_op_data1: vec4<f32>, // x: type (0=op, 1=leaf), y: op/scale, z: smoothing/padding, w: padding
    //     aabb_min: vec4<f32>,      // x,y,z, w: padding
    //     aabb_max: vec4<f32>,      // x,y,z, w: padding
    //     tree_indices: vec4<f32>,  // x: entry, y: exit, z: flattenedIndex, w: padding
    //     model_matrix: mat4x4<f32>, // 16 floats
    // };
    // Total: 4 * 4 + 16 = 32 floats * 4 bytes/float = 128 bytes.
    // Each field is vec4 aligned, and mat4 is also vec4 aligned. This is good.

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
    dataRevised[currentOffset++] = node.entry;
    dataRevised[currentOffset++] = node.exit;
    dataRevised[currentOffset++] = node.flattenedIndex; // Added for convenience in shader
    dataRevised[currentOffset++] = 0; // Padding

    // 5. model_matrix: mat4x4<f32> (16 floats) - Offset 16 (64 bytes)
    // If it's an operation node, its transform is implicitly identity for CSG,
    // or you could add a local transform to operation nodes. For now,
    // we'll default to identity if it's an operation node, or use the leaf's transform.
    const transformMatrix =
      node.type === "leaf" ? node.transform : mat4.identity(mat4.create());
    dataRevised.set(transformMatrix, currentOffset);
    currentOffset += 16; // Advance offset by 16 floats for the mat4

    // Final check for total size
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
      const serializedNodeData = SceneGraph.serializeFlattenedNode(node);
      buffer.set(serializedNodeData, index * nodeStrideInFloats);
    });

    return buffer;
  }
}

const sceneGraph = new SceneGraph();

// Initialize dummy mat4 for examples
const identityMat = mat4.identity(mat4.create());
const translateMat1 = mat4.fromTranslation(mat4.create(), [1, 0, 0]); // Sphere 2
const translateMat2 = mat4.fromTranslation(mat4.create(), [0, 2, 0]); // Sphere 3
const translateMat3 = mat4.fromTranslation(mat4.create(), [0, 0, 3]); // Sphere 4
const translateMat4 = mat4.fromTranslation(mat4.create(), [-1, -1, -1]); // Sphere 5

// 1. Create a root operation node
const rootNode = sceneGraph.addOperationNode({
  name: "Root Union",
  op: Operation.Union,
  smoothing: 0.1,
});

// 2. Add children to the root
const sphere1 = sceneGraph.addLeafNode(
  { name: "Sphere 1", transform: identityMat, scale: 1.0 },
  rootNode.id,
);
const group1 = sceneGraph.addOperationNode(
  { name: "Group 1 Difference", op: Operation.Difference, smoothing: 0.05 },
  rootNode.id,
);

// 3. Add children to group1
const sphere2 = sceneGraph.addLeafNode(
  { name: "Sphere 2", transform: translateMat1, scale: 0.8 },
  group1.id,
);
const sphere3 = sceneGraph.addLeafNode(
  { name: "Sphere 3", transform: translateMat2, scale: 0.5 },
  group1.id,
);

// 4. Add another group under the root
const group2 = sceneGraph.addOperationNode(
  { name: "Group 2 Intersect", op: Operation.Intersect, smoothing: 0.2 },
  rootNode.id,
);
const sphere4 = sceneGraph.addLeafNode(
  { name: "Sphere 4", transform: translateMat3, scale: 0.7 },
  group2.id,
);
const sphere5 = sceneGraph.addLeafNode(
  { name: "Sphere 5", transform: translateMat4, scale: 0.9 },
  group2.id,
);

export { sceneGraph };
