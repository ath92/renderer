import { createRoot } from "react-dom/client";
import { R3fRenderer } from "./three/r3f-renderer";
import { SelectedNodeSettings, TreeView } from "./tree-view/components";
import { Toolbar } from "./Toolbar";
import { useSignals } from "@preact/signals-react/runtime";
import { useState, useEffect } from "react";

export function App() {
  useSignals();
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Close panel when clicking outside on mobile
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      const panel = document.getElementById('left-panel');
      const toggleButton = document.getElementById('panel-toggle');
      
      if (isPanelOpen && panel && !panel.contains(target) && !toggleButton?.contains(target)) {
        setIsPanelOpen(false);
      }
    }

    if (isPanelOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isPanelOpen]);

  return (
    <>
      <div id="viewport">
        <R3fRenderer />
      </div>
      
      {/* Mobile toggle button */}
      <button 
        id="panel-toggle"
        className="panel-toggle"
        onClick={() => setIsPanelOpen(!isPanelOpen)}
        aria-label={isPanelOpen ? "Close panel" : "Open panel"}
      >
        <span className={`hamburger ${isPanelOpen ? 'open' : ''}`}>
          <span></span>
          <span></span>
          <span></span>
        </span>
      </button>

      <div id="left-panel" className={isPanelOpen ? 'open' : ''}>
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
