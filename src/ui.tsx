import { render, h } from 'preact';

export function App() {
    return (
        <div id="left-panel">
        </div>
    );
}

export function initUI() {
    render(<App />, document.getElementById('ui-root')!);
}
