import glsl from "vite-plugin-glsl";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [glsl(), wasm(), topLevelAwait()],
  build: {
    target: "esnext",
  },
});
