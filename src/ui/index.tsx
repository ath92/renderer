import { createRoot } from "react-dom/client";
import { R3fRenderer } from "./three/r3f-renderer";
import { SelectedNodeSettings, TreeView } from "./tree-view/components";
import { Toolbar } from "./Toolbar";
import { useSignals } from "@preact/signals-react/runtime";

export function App() {
  useSignals();
  return (
    <>
      <div id="viewport">
        <R3fRenderer />
      </div>
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
}
