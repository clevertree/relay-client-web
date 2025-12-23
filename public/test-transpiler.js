const code = `
export default function App(ctx) {
  return <div>Hello {ctx.name}</div>
}
`;

async function testTranspile() {
    // This script will be run after the WASM is loaded
    // Check if the transpiler is available
    if (!window.__hook_transpile_jsx) {
        console.error('Transpiler not loaded');
        return;
    }

    try {
        const result = window.__hook_transpile_jsx(code, 'test.jsx');
        console.log('=== TRANSPILE TEST ===');
        console.log('Input length:', code.length);
        console.log('Output length:', result.length);
        console.log('Has export:', result.includes('export'));
        console.log('Has export default:', result.includes('export default'));
        console.log('Has createElement:', result.includes('createElement'));
        console.log('Output preview:');
        console.log(result.substring(0, 500));
        console.log('...');
    } catch (e) {
        console.error('Transpile error:', e);
    }
}

// Run after a delay to ensure WASM is loaded
setTimeout(testTranspile, 2000);
