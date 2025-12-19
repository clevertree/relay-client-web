# HookContext Architecture

## Context Contract

The `HookContext` is a minimal, **immutable interface** passed to hooks at execution time. It provides only the essentials for hooks to render and interact with their environment.

### Definition

```typescript
export interface HookContext {
  React: any
  createElement: any
  FileRenderer: ComponentType<{ path: string }>
  Layout?: ComponentType<any>
  helpers: HookHelpers
}

export interface HookHelpers {
  buildPeerUrl: (path: string) => string
  loadModule: (modulePath: string, fromPath?: string) => Promise<any>
  setBranch?: (branch: string) => void
  buildRepoHeaders?: (branch?: string, repo?: string) => Record<string, string>
  registerThemeStyles?: (themeName: string, definitions?: Record<string, unknown>) => void
  registerThemesFromYaml?: (path: string) => Promise<void>
}
```

### Removed Fields

- **`params`**: ❌ Repos now manage internal state via React.useState(). No global params object.
- **`helpers.navigate`**: ❌ Repos handle routing internally. No host-side navigation helper.
- **Global path/branch tracking**: ❌ The host does not track repo internal state.

## Design Rationale

### 1. Decoupling from Host State

Previously, the host (HookRenderer/RepoBrowser) maintained a global `params` object tracking the repo's internal state (path, search query, etc.). This created tight coupling:

- Host and repo were intertwined.
- Repos could only exist within that specific host context.
- State synchronization issues across tabs/windows.

**New approach**: Repos are self-contained. They receive a static context and manage all state internally. The host is reduced to a renderer—it doesn't need to understand repo internals.

### 2. Avoiding Window API

Repos should not use `window.location`, `window.history`, or other browser APIs for navigation. This enables:

- Embedding in non-browser contexts (React Native, Node.js SSR).
- Sandboxing and security (repos can't manipulate browser state).
- Cleaner separation of concerns.

Instead, repos use **React state** for routing. The host can optionally listen to state changes via callbacks if needed in the future.

### 3. Immutable, Minimal Surface

- The context is a **thin contract** — only what's necessary to render.
- Helpers are **function-based**, not stateful objects.
- No hidden dependencies on host behavior.
- Easier to test and reason about.

## Example: get-client.jsx

```jsx
export default async function getClient(ctx) {
  const { React, FileRenderer, Layout, helpers } = ctx
  
  // Internal state — repo decides routing and UI flow
  const [path, setPath] = React.useState('/')
  
  // No helpers.navigate; internal navigation via setPath
  const navigate = (to) => {
    const dest = to.startsWith('/') ? to : `/${to}`
    setPath(dest)
  }

  // ... rest of hook logic
  
  return <LayoutComp path={path} onNavigate={navigate} />
}
```

## Example: Plugin Integration

### Old (coupled to host)
```jsx
export async function handleGetRequest(path, ctx) {
  const { helpers } = ctx
  // ...
  helpers.navigate(`/view/tmdb/${id}`)  // Assumed host would update
}
```

### New (decoupled)
```jsx
export async function handleGetRequest(path, ctx) {
  const { React } = ctx
  // Return a React element; caller handles navigation via props
  return <MovieView movie={movie} onBack={() => {...}} />
}
```

Plugins return JSX; callers (get-client.jsx) handle state updates.

## Using Helpers

### buildPeerUrl
```javascript
const url = helpers.buildPeerUrl('/README.md')
// → 'http://localhost:5173/template/README.md'
```

### loadModule
```javascript
const Module = await helpers.loadModule('./components/MovieView.jsx', '/hooks/client/get-client.jsx')
```

Loads and transpiles modules. Uses `fromPath` for relative resolution.

### registerThemesFromYaml
```javascript
await helpers.registerThemesFromYaml('./theme.yaml')
```

Loads a theme YAML file and registers it with the themed-styler bridge.

### buildRepoHeaders (optional)
```javascript
const headers = helpers.buildRepoHeaders?.('main')
// → { 'x-repo-branch': 'main', ... }
```

Build request headers for repo-aware APIs (if the repo requires authentication or context).

## Extending the Context

If new capabilities are needed:

1. **Add to HookHelpers interface** (not params or arbitrary context).
2. **Implement in HookRenderer** (provide the helper function).
3. **Use in hooks** (call `helpers.newFeature()`).

Example: Add a caching helper.
```typescript
export interface HookHelpers {
  // ...
  setCacheKey?: (key: string, value: any) => void
  getCacheKey?: (key: string) => any
}
```

## Future: Parent Context

For nested repos or parent-child communication, we could add:

```typescript
export interface HookContext {
  // ...
  parentContext?: {
    emit: (event: string, data: any) => void
    on: (event: string, callback) => () => void
  }
}
```

This allows child repos to emit events without tight coupling.

## Summary

- **Context is minimal**: Only React, FileRenderer, Layout, and helpers.
- **No params or navigate**: Repos manage state internally.
- **No window API**: Portable to any environment.
- **Helpers are the extension point**: Add new capabilities via helpers, not context mutations.
- **Repos are decoupled**: Embed anywhere, test independently.
