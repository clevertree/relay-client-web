# Relay Peer Configuration

## Web Client Environment Variables

The web client automatically exposes public environment variables prefixed with `RELAY_PUBLIC_` and `VITE_` via `import.meta.env`.

### Configuration

Set the master peer list in `.env`:

```dotenv
# Semicolon-separated list of relay peer URLs (e.g., https://relay1.example.com;https://relay2.example.com)
RELAY_PUBLIC_MASTER_PEER_LIST="https://node-dfw1.relaynet.online;https://node-dfw2.relaynet.online"
```

### Build-time Injection

When you build the project (`npm run build`), the esbuild configuration:
1. Reads the `.env` file
2. Extracts all `RELAY_PUBLIC_*` and `VITE_*` variables
3. Injects them into `import.meta.env` definitions in the bundle

This makes them accessible in code:

```typescript
const peerList = import.meta.env.RELAY_PUBLIC_MASTER_PEER_LIST
// => "https://node-dfw1.relaynet.online;https://node-dfw2.relaynet.online"
```

### Build Process

- **Development watch server** (`npm run dev`): Uses watch-dev.sh with production builds; rebuilds on src/ changes
- **Production build** (`npm run build`): Uses Vite to bundle; reads .env and injects public vars

### Usage in PeersView Component

The [src/components/PeersView.tsx](src/components/PeersView.tsx) component reads the peer list with fallback chain:

1. localStorage (user customizations)
2. `import.meta.env.RELAY_PUBLIC_MASTER_PEER_LIST` (build-time env)
3. Server config API
4. Localhost fallback

Example output:
```typescript
// From getPeersFromEnvironment() in PeersView.tsx
[
  "https://node-dfw1.relaynet.online",
  "https://node-dfw2.relaynet.online"
]
```

## Testing

Build and check that peer list is in bundle:

```bash
npm run build
grep "node-dfw1" dist/assets/main.js  # Should find the URLs
```
