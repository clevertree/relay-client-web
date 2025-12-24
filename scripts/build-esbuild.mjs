#!/usr/bin/env node
import { build, context } from 'esbuild'
import fs from 'fs'
import path from 'path'
import express from 'express'
import http from 'http'
import { createRequire } from 'node:module'

const root = path.resolve(path.join(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..'))
const srcDir = path.join(root, 'src')
const outDir = path.join(root, 'dist')
const assetsDir = path.join(outDir, 'assets')
const templateDir = path.resolve(path.join(root, '../relay/template'))

function copyPublic() {
  const publicDir = path.join(root, 'public')
  if (fs.existsSync(publicDir)) {
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true })
    }
    const files = fs.readdirSync(publicDir)
    for (const file of files) {
      const src = path.join(publicDir, file)
      const dest = path.join(outDir, file)
      try {
        if (fs.lstatSync(src).isSymbolicLink()) {
          // Skip symbolic links that might point to missing targets
          continue
        }
        fs.cpSync(src, dest, { recursive: true, force: true, dereference: true })
      } catch (e) {
        console.warn(`[esbuild] Failed to copy ${src} to ${dest}: ${e.message}`)
      }
    }
  }
}

function copyHooksToTemplate() {
  const hooksDir = path.join(root, 'hooks')
  const hooksOut = path.join(templateDir, 'hooks')
  if (fs.existsSync(hooksDir)) {
    try {
      fs.cpSync(hooksDir, hooksOut, { recursive: true, force: true })
      console.log('[esbuild] Copied hooks directory to template/hooks')
    } catch (e) {
      console.warn(`[esbuild] Failed to copy hooks to template: ${e.message}`)
    }
  }
}

function copyHooksToDist() {
  const hooksDir = path.join(root, 'hooks')
  const hooksOut = path.join(outDir, 'hooks')
  if (fs.existsSync(hooksDir)) {
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true })
    }
    try {
      fs.cpSync(hooksDir, hooksOut, { recursive: true, force: true })
      console.log('[esbuild] Copied hooks directory to dist/hooks')
    } catch (e) {
      console.warn(`[esbuild] Failed to copy hooks to dist: ${e.message}`)
    }
  }
}

function copyHooksToPublic() {
  const hooksDir = path.join(root, 'hooks')
  const publicDir = path.join(root, 'public')
  const hooksOut = path.join(publicDir, 'hooks')
  if (fs.existsSync(hooksDir)) {
    try {
      fs.cpSync(hooksDir, hooksOut, { recursive: true, force: true })
      console.log('[esbuild] Copied hooks directory to public/hooks')
    } catch (e) {
      console.warn(`[esbuild] Failed to copy hooks to public: ${e.message}`)
    }
  }
}

function copyWasmToAssets() {
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true })
  }

  // Copy WASM files from node_modules to assets directory
  // The bundled JS files use import.meta.url to resolve WASM files relatively
  const wasmSources = [
    {
      dir: path.join(root, 'node_modules/@clevertree/hook-transpiler/wasm'),
      files: ['relay_hook_transpiler_bg.wasm']
    },
    {
      dir: path.join(root, 'node_modules/@clevertree/themed-styler/wasm'),
      files: ['themed_styler_bg.wasm']
    }
  ]

  for (const { dir, files } of wasmSources) {
    if (fs.existsSync(dir)) {
      for (const file of files) {
        const src = path.join(dir, file)
        const dest = path.join(assetsDir, file)
        try {
          fs.copyFileSync(src, dest)
        } catch (e) {
          console.warn(`[esbuild] Failed to copy WASM ${src}: ${e.message}`)
        }
      }
    }
  }
}

// Read .env file and extract RELAY_PUBLIC_* variables
function readEnvFile(envPath) {
  const env = {}
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim()
      // Expose RELAY_PUBLIC_* variables
      if (key.startsWith('RELAY_PUBLIC_')) {
        env[key] = val.replace(/^["|']|["|']$/g, '')
      }
    }
  }
  return env
}

export async function bundle({ serve = false } = {}) {
  const envVars = readEnvFile(path.join(root, '.env'))

  // Build define object for import.meta.env access
  const importMetaDefines = {}
  for (const [key, val] of Object.entries(envVars)) {
    importMetaDefines[`import.meta.env.${key}`] = JSON.stringify(val)
  }

  // Resolve React/ReactDOM from the app root to avoid duplicate copies
  const req = createRequire(import.meta.url)
  const reactEntry = req.resolve('react')
  const reactJsxRuntimeEntry = req.resolve('react/jsx-runtime')
  const reactDomEntry = req.resolve('react-dom')
  const reactDomClientEntry = req.resolve('react-dom/client')

  const opts = {
    entryPoints: {
      'main': path.join(srcDir, 'main.tsx'),
      'index': path.join(srcDir, 'assets', 'index.css'),
    },
    outdir: assetsDir,
    publicPath: '/assets/',
    bundle: true,
    format: 'esm',
    sourcemap: true,
    minify: false,
    target: ['es2020'],
    jsx: 'automatic',
    jsxImportSource: 'react',
    loader: {
      '.png': 'file',
      '.svg': 'file',
      '.css': 'css',
      '.wasm': 'file',
      '.yaml': 'text',
    },
    metafile: true,
    splitting: true,
    logLevel: 'info',
    external: ['android-ios-native'],
    define: {
      'process.env.NODE_ENV': '\"development\"',
      '__DEV__': 'true',
      ...importMetaDefines,
    },
    plugins: [
      // Force a single React instance across workspace packages
      {
        name: 'force-react-singleton',
        setup(build) {
          build.onResolve({ filter: /^(react|react\/jsx-runtime|react-dom|react-dom\/client)$/ }, args => {
            switch (args.path) {
              case 'react':
                return { path: reactEntry }
              case 'react/jsx-runtime':
                return { path: reactJsxRuntimeEntry }
              case 'react-dom':
                return { path: reactDomEntry }
              case 'react-dom/client':
                return { path: reactDomClientEntry }
            }
          })
        }
      },
      // Resolve absolute `/src/...` imports (used by shared wasmLoader shim) to this package's src directory
      {
        name: 'alias-src-root',
        setup(build) {
          build.onResolve({ filter: /^\/src\// }, args => {
            const rel = args.path.slice('/src/'.length)
            const target = path.join(srcDir, rel)
            // Prefer explicit .ts resolution for our source files
            const withTs = `${target}.ts`
            if (fs.existsSync(withTs)) return { path: withTs }
            if (fs.existsSync(target)) return { path: target }
            return { path: withTs }
          })
        }
      },
      {
        name: 'browser-external-node-module',
        setup(build) {
          build.onResolve({ filter: /^node:module$/ }, args => {
            return { path: args.path, namespace: 'browser-external' }
          })
          build.onLoad({ filter: /.*/, namespace: 'browser-external' }, () => {
            const code = `export function createRequire() { return function() { throw new Error('createRequire is not available in the browser'); }; }`
            return { contents: code, loader: 'js' }
          })
        }
      }
    ],
    // Use a stable entry name for predictable index.html
    entryNames: '[name]',
  }
  if (serve) {
    const appCTX = await context(opts)

    // Use Express to serve everything with proper MIME types on one port
    const app = express()

    // Middleware to set proper MIME types for .jsx, .ts, .tsx, .js files
    app.use((req, res, next) => {
      if (req.path.endsWith('.jsx')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
      } else if (req.path.endsWith('.ts') || req.path.endsWith('.tsx')) {
        res.setHeader('Content-Type', 'application/typescript; charset=utf-8')
      } else if (req.path.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
      }
      next()
    })

    // Set CORS headers
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*')
      res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
      next()
    })

    // Serve /hooks/* directly from public/hooks/ (live updates without rebuild)
    const publicHooksDir = path.join(root, 'public', 'hooks')
    if (fs.existsSync(publicHooksDir)) {
      app.use('/hooks', express.static(publicHooksDir, {
        dotfiles: 'allow'
      }))
      console.log('[esbuild] Serving /hooks/* from public/hooks/ (live)')
    }

    // Serve the main app from dist/ 
    app.use(express.static(outDir, {
      index: 'index.html',
      dotfiles: 'allow'
    }))

    // Fallback to index.html for SPA routing
    app.get('*', (req, res) => {
      res.sendFile(path.join(outDir, 'index.html'))
    })

    // Build once before starting server
    await appCTX.rebuild()
    copyHooksToPublic()
    copyPublic()
    copyWasmToAssets()
    // Note: copyHooksToDist() NOT called - we serve /hooks/* directly from public/hooks/
    copyHooksToTemplate()

    const server = http.createServer(app)
    const port = 8001
    server.listen(port, '0.0.0.0', () => {
      console.log(`[esbuild] serving at http://localhost:${port}`)
    })

    return { host: 'localhost', port }
  } else {
    const result = await build(opts)
    copyHooksToPublic()
    copyPublic()
    copyWasmToAssets()
    copyHooksToDist()
    copyHooksToTemplate()
    return { jsFile: 'main.js' }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const serve = process.argv.includes('--serve')
  bundle({ serve }).catch(err => {
    console.error('[esbuild] build failed', err)
    process.exit(1)
  })
}
