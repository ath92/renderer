# Progressive 3D Fractal Renderer

Progressive 3D fractal renderer is a real-time interactive web application that renders complex fractals using WebGPU and signed distance functions (SDFs). It uses progressive rendering techniques and raymarching to handle computationally expensive 3D fractal visualization at smooth framerates.

**ALWAYS reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

## Working Effectively

### Bootstrap and Build the Repository
Run these commands in exact order:
- `npm install` -- takes 51 seconds. May show engine version warnings (safe to ignore).
- `npm run build` -- takes 10-15 seconds. NEVER CANCEL. Set timeout to 60+ seconds.

### Development Workflow
- **Development server**: `npm run dev` -- starts in 347ms on http://localhost:5173
- **Production preview**: `npm run preview` -- serves built version on http://localhost:4173
- **Build for production**: `npm run build` -- creates optimized bundle in `/dist`

### Critical Build Information
- **NEVER CANCEL builds or long-running commands**
- **NO linting or testing scripts exist** - the repository has no eslint, prettier, or test configurations
- TypeScript compilation is strict - fix unused imports immediately to prevent build failures
- Build warns about large chunks (>500KB) - this is expected due to WASM modules

## Validation Requirements

### Manual Testing Scenarios
After making ANY changes, ALWAYS validate these scenarios:

1. **Application Loads Successfully**:
   - Run `npm run dev`
   - Navigate to http://localhost:5173
   - Verify the 3D fractal spheres render in the main viewport
   - Verify the CSG tree structure displays in the left panel

2. **Interactive Features Work**:
   - Click "place sphere" button - it should toggle to "place sphere !"
   - Click anywhere in the 3D viewport while in place sphere mode
   - Verify new nodes appear in the CSG tree structure
   - Test camera controls (mouse movement for rotation/zoom)

3. **WebGPU/WebGL Fallback**:
   - Check browser console for WebGPU support messages
   - Verify application works with either WebGPU or WebGL fallback
   - Console warnings about "WebGPU is experimental" are normal and expected

### Expected Console Output
Normal operation shows:
```
[vite] connected.
WebGPU is experimental on this platform.
Failed to create WebGPU Context Provider (WebGL fallback active)
csg 1, csg 2, csg 3... (normal CSG tree updates)
```

## Technical Architecture

### Key Components
- **Entry Point**: `src/main.ts` - application initialization and WebGPU setup
- **UI Framework**: React 19 with TypeScript, rendered via React Three Fiber
- **Rendering**: WebGPU shaders (WGSL) in `src/wgsl-shaders/` with WebGL fallback
- **CSG Operations**: `src/csg-tree.ts` - Constructive Solid Geometry tree management
- **Fractals**: Multiple implementations (Klein, Mandelbulb, Menger, etc.)

### Important File Locations
- `/src/ui/` - All React UI components (Toolbar, tree view, Three.js integration)
- `/src/wgsl-shaders/` - WebGPU compute and fragment shaders
- `/src/webgpu-*.ts` - WebGPU initialization, buffers, and bind groups
- `/vite.config.ts` - Build configuration with WASM and GLSL plugins
- `/tsconfig.json` - Strict TypeScript configuration

### Development Dependencies
- **Vite 7.0.6** - Build tool and dev server
- **TypeScript 5.0.2** - Language and compiler
- **React 19** - UI framework
- **Three.js + React Three Fiber** - 3D rendering library
- **WebGPU types** - GPU compute API typings

## Common Development Tasks

### Fixing TypeScript Errors
- Remove unused imports immediately - strict noUnusedLocals/noUnusedParameters enabled
- All imports must be used or TypeScript compilation fails
- Example: Change `import foo, { unused }` to `import foo`

### Modifying Shaders
- WGSL shaders in `src/wgsl-shaders/*.wgsl` are loaded via vite-plugin-glsl
- Changes require dev server restart to take effect
- Test both WebGPU and WebGL code paths

### Working with CSG Trees
- Modify `src/csg-tree.ts` for tree structure changes
- Always test sphere placement functionality after CSG modifications
- Check `src/ui/tree-view/components.tsx` for UI updates

### WebGPU Development
- WebGPU support varies by browser - test with Chrome/Edge for best support
- Application gracefully falls back to WebGL when WebGPU unavailable
- Check `src/webgpu-init.ts` for adapter and device initialization

## Performance Considerations

### Progressive Rendering
- App renders progressively: low resolution when camera moves, high resolution when stationary
- Frame rate prioritized over resolution for smooth interaction
- Anti-aliasing achieved through multi-frame accumulation

### Build Output Expectations
- Large bundle sizes (1.8MB+ main chunk) due to fractal mathematics and WASM
- 3MB+ WASM file for Loro CRDT library
- Warnings about chunk sizes are expected and normal

## Common Repository Commands Output

### `ls -la` (Repository Root)
```
.git/
.gitignore
README.md
index.html           -- HTML entry point
operators_plan.md    -- Development planning document
package.json         -- Dependencies and scripts
package-lock.json    -- Locked dependency versions
plan.md             -- Project roadmap
screencapture.png   -- Demo screenshot
src/                -- Main source code
tsconfig.json       -- TypeScript configuration
vite.config.ts      -- Vite build configuration
yarn.lock           -- Alternative lock file (use npm)
```

### `npm run --silent list` Output
```
dev: vite
build: tsc && vite build
preview: vite preview
```

### Build Success Output
```
✓ 638 modules transformed.
dist/assets/loro_wasm_bg-[hash].wasm  3,164.07 kB
dist/assets/index-[hash].css              1.44 kB  
dist/assets/index-[hash].js           1,874.98 kB
(!) Some chunks are larger than 500 kB (expected warning)
✓ built in 10.13s
```

## Troubleshooting

### Common Issues
- **Build fails with unused import errors**: Remove unused imports from TypeScript files
- **WebGPU not working**: Expected in many environments - WebGL fallback will activate
- **Large bundle warnings**: Normal due to complex mathematics and WASM dependencies
- **Console WebGPU experimental warnings**: Safe to ignore, indicates fallback is working

### Emergency Recovery
- If TypeScript compilation fails: Check for unused imports in recent file changes
- If dev server won't start: Delete `node_modules` and run `npm install` again
- If application won't render: Check browser WebGL support and console errors

Remember: This is a cutting-edge graphics application using experimental Web APIs. Console warnings about WebGPU, WebGL, and experimental features are normal operation.