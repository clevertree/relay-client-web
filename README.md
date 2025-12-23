# <img src="public/icon.png" width="32" height="32" align="center" /> Relay Client Web (React + TypeScript)

This template provides a minimal setup to get React working in esbuild with some ESLint rules.

Currently, two official plugins are available:

- [esbuild](https://esbuild.github.io/) for fast builds and bundling

## Hook Component Naming Convention

To distinguish between precompiled JSX components and runtime-transpiled hook components:

- **Lowercase filenames** (`app.jsx`, `home.jsx`, `errorBoundary.jsx`): Runtime-transpiled hook components that are loaded dynamically
- **PascalCase filenames** (`App.jsx`, `Home.jsx`): Precompiled JSX components (not used in this project, but useful when integrating with other frameworks)

All client hook components in `public/hooks/` should use **lowercase** filenames to maintain consistency with dynamic loading patterns.

## Lazy Loading Hook Components

Hook components support React's lazy loading and error boundaries for code splitting:

```jsx
import React, { useState, useEffect, lazy, Suspense } from 'react'
import errorBoundary from './errorBoundary.jsx'

// Lazy load page components using dynamic import()
const Home = lazy(() => import('./home.jsx'))
const Settings = lazy(() => import('./settings.jsx'))
const Test = lazy(() => import('./test.jsx'))

export default function App() {
  return (
    <errorBoundary>
      <Suspense fallback={<div>Loading...</div>}>
        <Home />
      </Suspense>
    </errorBoundary>
  )
}
```

**How it works:**
- Dynamic `import('./module.jsx')` calls are automatically rewritten by hook-transpiler to `__hook_import('./module.jsx')`
- `__hook_import` is a runtime function that loads modules relative to the current hook's path
- `Suspense` wraps lazy components to display a loading fallback while the module loads
- `ErrorBoundary` catches any errors during component rendering or loading

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
