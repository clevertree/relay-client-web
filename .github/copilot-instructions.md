# relay-clients Copilot Instructions

## Project Overview
Monorepo containing web (Next.js) and mobile (React Native) clients for Relay hook execution system.

### Structure
```
relay-clients/
├── packages/
│   ├── web/           - Next.js web client
│   ├── mobile/        - React Native mobile client
│   ├── shared/        - Shared runtime/utils
│   └── [other packages]
```

## Web Client (packages/web/)

### Tech Stack
- Next.js (App Router)
- React 18+
- TypeScript
- Tailwind CSS (if configured)
- WASM (hook-transpiler)

### Key Directories
- `src/wasm/` - **WASM artifacts** (managed by hook-transpiler build)
- `src/runtime/` - Module runtime loaders
- `src/lib/` - Utilities

### WASM Integration
**Critical:** WASM files managed by `hook-transpiler/build-and-deploy.sh`

Files in `src/wasm/`:
- `relay_hook_transpiler.js` - WASM loader (NOT hook_transpiler_*)
- `relay_hook_transpiler_bg.wasm` - Binary (4.4+ MB)
- Type definitions (`*.d.ts`)

**Common Issue:** Old file names from failed builds
- Wrong: `hook_transpiler_*.js`, `hook_transpiler_*.wasm`
- Right: `relay_hook_transpiler_*.js`, `relay_hook_transpiler_*.wasm`

If wrong files present, delete and rebuild:
```bash
cd /home/ari/dev/hook-transpiler
rm -rf pkg/ target/
bash build-and-deploy.sh
```

### Runtime Loader (`packages/shared/src/runtimeLoader.ts`)

Executes hook code with injected metadata:
```typescript
// Injected globals before module execution:
const filename = "/hooks/client/get-client.jsx"
const dirname = "/hooks/client"
const url = "http://localhost:5173/hooks/client/get-client.jsx"
```

Also provides module globals:
```typescript
globalThis.__hook_react = React
globalThis.__hook_jsx_runtime = { jsx, jsxs, Fragment }
globalThis.__hook_file_renderer = FileRenderer
globalThis.__hook_helpers = helpers
globalThis.__relay_meta = { filename, dirname, url }
```

### Hook Execution Flow
1. **Fetch** hook source from filesystem/URL
2. **Transpile** with WASM (`transpile_jsx()`)
3. **Prepare** module with globals & metadata injection
4. **Execute** with Function constructor
5. **Render** returned JSX element

## Mobile Client (packages/mobile/)

### Tech Stack
- React Native
- TypeScript
- Expo (if applicable)

### WASM Support
React Native has **no WASM support** - use CommonJS transpilation target.

Transpiler CommonJS output (`to_commonjs: true`):
- Converts `export` → `Object.defineProperty(exports, ...)`
- Module runs via `require()` or custom loader

## Shared Packages (packages/shared/)

### Runtime Module
- `src/runtimeLoader.ts` - Hook execution engine
- `src/wasmEntry.ts` - WASM initialization

### Key Exports
Functions for loading and executing hooks with proper context injection.

## Build & Development

### Run Web Dev Server
```bash
cd /home/ari/dev/relay-clients/packages/web
npm run dev  # or pnpm run dev
```

### Monorepo Commands
Workspace managed by `pnpm-workspace.yaml` (or npm workspaces).

Build all:
```bash
npm run build  # from root
```

### WASM Integration Checklist

When hook-transpiler changes:
1. ✅ Run `cd hook-transpiler && bash build-and-deploy.sh`
2. ✅ Verify `relay_hook_transpiler_bg.wasm` > 4MB in `packages/web/src/wasm/`
3. ✅ Restart web dev server (`npm run dev`)
4. ✅ Hard refresh browser (Ctrl+Shift+R)
5. ✅ Check DevTools: `window.__hook_transpile_jsx` should exist

## Common Issues

### "Cannot find module relay_hook_transpiler"
- WASM files not deployed to `src/wasm/`
- Wrong filenames (hook_transpiler_* instead of relay_hook_transpiler_*)
- Run `bash hook-transpiler/build-and-deploy.sh` again

### Hook not rendering
1. Check transpiler output in DevTools Network/Console
2. Verify special imports rewritten to globals (grep for `globalThis.__`)
3. Ensure `@relay/meta` exports available in runtimeLoader
4. Check plugin functions export correctly

### React import errors
1. Verify `__hook_react` available in globalThis
2. Check runtimeLoader sets React before execution
3. Confirm transpiler rewrote `import React from 'react'` to global

## Environment Files (./env.json)

Hooks can load adjacent env.json:
```javascript
import { dirname, url } from '@relay/meta'
const envUrl = new URL('./env.json', dirname)
const resp = await fetch(envUrl)
const env = await resp.json()
```

Path must be resolved correctly using injected `dirname`.

## Key Files
- `packages/shared/src/runtimeLoader.ts` - Module execution
- `packages/shared/src/wasmEntry.ts` - WASM loader
- `packages/web/src/wasm/relay_hook_transpiler*` - WASM artifacts
