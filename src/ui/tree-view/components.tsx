import { h } from 'preact';
import { blobTree, collapsedNodes, toggleNode } from './state';
import './style.css';

const OperationMap = {
    0: 'Union',
    1: 'Intersect',
    2: 'Difference',
}

function LeafNode({ node }) {
    return <div class="tree-node leaf-node">{node.id}</div>;
}

function OperationNode({ node }) {
    const isCollapsed = collapsedNodes.value.has(node.id);

    return (
        <div class="tree-node operation-node">
            <div class="node-details" onClick={() => toggleNode(node.id)}>
                <span>{node.id}</span>
                <span class="operation-type">{OperationMap[node.op]}</span>
            </div>
            {!isCollapsed && (
                <div class="children">
                    {node.children.map((childId) => {
                        const childNode = blobTree.value.getNode(childId);
                        return childNode ? <TreeNode node={childNode} /> : null;
                    })}
                </div>
            )}
        </div>
    );
}

function TreeNode({ node }) {
    if (node.type === 'leaf') {
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
