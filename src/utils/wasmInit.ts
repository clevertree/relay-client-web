// Custom WASM initialization that bypasses hardcoded /wasm/ paths in npm packages
// and uses import.meta.url resolution instead

export async function initHookTranspiler() {
    if (globalThis.__hook_transpile_jsx) {
        return; // Already initialized
    }

    try {
        // Import the WASM module directly - it will be bundled by esbuild
        // The WASM file will use import.meta.url to find relay_hook_transpiler_bg.wasm
        const wasmModule = await import('../../node_modules/@clevertree/hook-transpiler/wasm/relay_hook_transpiler.js');

        // Call init without parameters to use default import.meta.url resolution
        await wasmModule.default();

        // Set up global functions
        const version = wasmModule.get_version ? wasmModule.get_version() : 'wasm';
        globalThis.__hook_transpiler_version = version;
        globalThis.__hook_transpile_jsx = (code, filename, isTypescript) => {
            return wasmModule.transpile_jsx(code, filename || 'module.tsx', isTypescript);
        };
        globalThis.__hook_wasm_self_test = wasmModule.run_self_test;

        console.log('[hook-transpiler] WASM transpiler ready:', version);
    } catch (e) {
        console.error('[hook-transpiler] Failed to initialize:', e);
        throw e;
    }
}

export async function initThemedStylerWasm() {
    if (globalThis.__themedStylerRenderCss) {
        return; // Already initialized
    }

    try {
        // Import the WASM module directly
        const wasmModule = await import('../../node_modules/@clevertree/themed-styler/wasm/themed_styler.js');

        // Call init without parameters to use default import.meta.url resolution
        await wasmModule.default();

        // Set up global functions
        const version = wasmModule.get_version ? wasmModule.get_version() : 'wasm';
        globalThis.__themedStylerVersion = version;
        globalThis.__themedStylerRenderCss = (usage, themes) => {
            const state = {
                ...themes,
                used_tags: usage.tags,
                used_classes: usage.classes,
                used_tag_classes: usage.tagClasses,
            };
            return wasmModule.render_css_for_web(JSON.stringify(state));
        };
        globalThis.__themedStylerGetRn = (selector, classes, themes) => {
            const state = { ...themes };
            return JSON.parse(wasmModule.get_rn_styles(JSON.stringify(state), selector, JSON.stringify(classes)));
        };

        console.log('[themed-styler] WASM initialized:', version);
    } catch (e) {
        console.error('[themed-styler] Failed to initialize:', e);
        throw e;
    }
}
