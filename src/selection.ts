import { signal } from "@preact/signals-react";
import { TreeID } from "loro-crdt";

export const selectedNode = signal<TreeID | null>(null);
