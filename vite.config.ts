import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import path from 'path'
import fs from 'fs'

function template404Plugin() {
    return {
        name: 'template-404-middleware',
        apply: 'serve',
        configureServer(server: any) {
            const publicDir: string = server.config.publicDir
            const rootPublic = path.resolve(publicDir)
            server.middlewares.use((req: any, res: any, next: any) => {
                try {
                    const url = req.url as string || ''
                    if (!url.startsWith('/template/')) return next()
                    const u = new URL(url, 'http://dev.local')
                    const pathname = decodeURIComponent(u.pathname)
                    const filePath = path.resolve(path.join(publicDir, pathname))
                    if (!filePath.startsWith(rootPublic)) {
                        res.statusCode = 403
                        res.setHeader('content-type', 'text/plain')
                        return res.end('Forbidden')
                    }
                    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                        return next()
                    }
                    res.statusCode = 404
                    res.setHeader('content-type', 'text/plain')
                    return res.end('Not Found')
                } catch (_) {
                    return next()
                }
            })
        },
    }
}

// https://vite.dev/config/
export default defineConfig({
    plugins: [template404Plugin(), react(), wasm()],
    server: {
        // Serve /template folder as static assets
        middlewareMode: false,
    },
    publicDir: 'public',
    optimizeDeps: {
        include: ['@swc/wasm-web', '@babel/standalone'],
    },
    build: {
        minify: false, // Keep bundles readable for debugging
        // Disable sourcemaps by default to keep Docker/CI builds memory-light.
        // Enable by setting VITE_SOURCEMAP=true when needed locally.
        sourcemap: process.env.VITE_SOURCEMAP === 'true',
    },
    // Ensure React dev build can be selected for debug dist builds
    // Use VITE_NODE_ENV to force development mode when needed
    define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.VITE_NODE_ENV || process.env.NODE_ENV || 'production'),
    },
    // Configure server to serve template folder
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@relay/shared': path.resolve(__dirname, './src/shared'),
            // Provide a shim alias for Babel-standalone so shared code can import a stable name
            '@babel-standalone-shim': '@babel/standalone',
        },
        dedupe: ['react', 'react-dom'],
    },
})
