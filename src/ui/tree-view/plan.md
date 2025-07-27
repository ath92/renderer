# Plan for Building the Tree View

This plan outlines the steps to create a Preact-based tree view component that visualizes the blob-tree data from `src/blob-tree.ts`.

## 1. Data Fetching and State Management

- **Create a new file `src/ui/tree-view/state.ts`** to manage the state of the tree view.
- This file will export a `signal` from `@preact/signals` that holds the blob-tree data.
- It will also export a function to fetch the blob-tree and update the signal.

## 2. Create Tree View Components

- **Create a new file `src/ui/tree-view/components.tsx`** to house the UI components for the tree view.
- **`TreeView` component:** This will be the main component that renders the entire tree. It will take the blob-tree data as a prop and render the root node.
- **`TreeNode` component:** This component will render a single node in the tree. It will be a recursive component that renders its children. It will display the node's ID.
- **`OperationNode` component:** This component will render an operation node (Union, Intersect, Difference). It will display the node's ID and the operation type.
- **`LeafNode` component:** This component will render a leaf node. It will display the node's ID.

## 3. Styling

- **Create a new file `src/ui/tree-view/style.css`** for the tree view styles.
- Add styles for the tree view container, nodes, and their properties.
- Use a collapsible tree view design for better user experience.

## 4. Integration

- **Update `src/ui/index.tsx`** to import and render the `TreeView` component.
- Pass the blob-tree data from the state management file to the `TreeView` component.