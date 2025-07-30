import { render } from 'preact';
import { TreeView } from './tree-view/components';

export function App() {
    return (
        <div id="left-panel">
            <TreeView />
        </div>
    );
}

export function initUI() {
    render(<App />, document.getElementById('ui-root')!);
}
