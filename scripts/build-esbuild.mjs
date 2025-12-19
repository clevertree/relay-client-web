#!/usr/bin/env node
import { build, context } from 'esbuild'
import fs from 'fs'
import path from 'path'

const root = path.resolve(path.join(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..'))
const srcDir = path.join(root, 'src')
const outDir = path.join(root, 'dist')
const assetsDir = path.join(outDir, 'assets')

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
    external: ['react-native'],
    define: {
      'process.env.NODE_ENV': '\"development\"',
      '__DEV__': 'true',
      ...importMetaDefines,
    },
    plugins: [
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
    const ctx = await context(opts)
    const { host, port } = await ctx.serve({
      host: '0.0.0.0',
      port: 8001,
      servedir: outDir,
      fallback: path.join(outDir, 'index.html')
    })

    // We still need to generate the assets once
    await ctx.rebuild()
    copyPublic()

    console.log(`[esbuild] serving at http://${host || 'localhost'}:${port}`)
    return { host, port }
  } else {
    const result = await build(opts)
    copyPublic()
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
