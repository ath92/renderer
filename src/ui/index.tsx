import { render } from "preact";
import { SelectedNodeSettings, TreeView } from "./tree-view/components";

export function App() {
  return (
    <div id="left-panel">
      <TreeView />
      <SelectedNodeSettings />
    </div>
  );
}

export function initUI() {
  render(<App />, document.getElementById("ui-root")!);
}
