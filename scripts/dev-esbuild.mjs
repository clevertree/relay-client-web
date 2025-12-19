#!/usr/bin/env node
import { bundle } from './build-esbuild.mjs'
import { spawn } from 'node:child_process'
import path from 'path'

async function main() {
  const root = path.resolve(path.join(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..'))
  // Start esbuild in watch mode
  await bundle({ watch: true })
  // Start dev-server.js to serve dist/ and relay-template/ from root
  const server = spawn('node', ['dev-server.js'], { cwd: root, stdio: 'inherit', env: { ...process.env, PORT: process.env.PORT || '5174' } })
  server.on('exit', (code) => {
    console.log(`[dev-server] exited with code ${code}`)
  })
}

main().catch((e) => {
  console.error('[dev-esbuild] failed', e)
  process.exit(1)
})
