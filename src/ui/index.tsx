import { createRoot } from "react-dom/client";
import { R3fRenderer } from "./three/r3f-renderer";
import { SelectedNodeSettings, TreeView } from "./tree-view/components";
import { Toolbar } from "./Toolbar";

export function App() {
  return (
    <>
      <div id="left-panel">
        <TreeView />
        <SelectedNodeSettings />
        <Toolbar />
      </div>
    </>
  );
}

export function initUI() {
  const root = createRoot(document.getElementById("ui-root")!);
  root.render(<App />);

  const viewportRoot = createRoot(document.getElementById("viewport")!);
  viewportRoot.render(<R3fRenderer />);
}
