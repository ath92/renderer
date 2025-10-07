import { signal } from "@preact/signals-react";
import { Tool } from "./Toolbar";

export const activeTool = signal<Tool | null>(null);
export const isSidebarOpen = signal(false);
