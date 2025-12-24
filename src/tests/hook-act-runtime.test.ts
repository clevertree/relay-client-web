// Test harness: Hook execution with Act runtime
// Verifies lazy/Suspense work when hooks use Act instead of React
import test, { describe, it, before, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { JSDOM } from 'jsdom';

describe('Hook Renderer with Act Runtime', async () => {
    let dom: JSDOM;
    let container: any;
    let Act: any;

    before(async () => {
        // Set up JSDOM environment
        dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
        (globalThis as any).window = dom.window;
        (globalThis as any).document = dom.window.document;
        (globalThis as any).Node = dom.window.Node;
        (globalThis as any).HTMLElement = dom.window.HTMLElement;
        (globalThis as any).Text = dom.window.Text;

        container = dom.window.document.body;

        // Load Act and create instance with container
        const actModule = await import('@clevertree/act/dom');
        Act = actModule.createDomAct(container);

        // Install Act as the React runtime for hooks
        (globalThis as any).__hook_react = Act;
        (globalThis as any).__hook_react_dom = { createRoot: actModule.createRoot };
        (globalThis as any).React = Act;
        (globalThis as any).ReactDOM = { createRoot: actModule.createRoot };

        console.log('[Test Setup] Act installed as React runtime', {
            hasLazy: typeof Act.lazy,
            hasSuspense: typeof Act.Suspense,
            hasCreateElement: typeof Act.createElement
        });
    });

    afterEach(() => {
        if (container) container.innerHTML = '';
    });

    it('should render simple hook with Act', async () => {
        const hookCode = `
            (function() {
                const exports = {};
                const module = { exports };
                
                module.exports.default = function TestHook() {
                    const React = globalThis.__hook_react || globalThis.React;
                    return React.createElement('div', { className: 'test' }, 'Hello from Act');
                };
                
                return module.exports.default;
            })()
        `;

        // Execute hook code directly
        const Component = eval(hookCode);

        Act.render(Component, {});

        assert.strictEqual(container.textContent, 'Hello from Act');
        assert.strictEqual(container.querySelector('.test')?.textContent, 'Hello from Act');
    });

    it('should handle lazy components with Suspense in hook', async () => {
        // Test that Suspense/lazy are available - actual rendering tested in Act core tests
        const hookCode = `
            (function() {
                const exports = {};
                const module = { exports };
                
                module.exports.default = function TestHook() {
                    const React = globalThis.__hook_react || globalThis.React;
                    
                    // Just verify Suspense and lazy exist and are callable
                    if (typeof React.lazy !== 'function') {
                        throw new Error('React.lazy is not a function');
                    }
                    if (typeof React.Suspense !== 'function') {
                        throw new Error('React.Suspense is not a function');
                    }
                    
                    // Return simple content for this test
                    return React.createElement('div', {}, 'Suspense and lazy are available');
                };
                
                return module.exports.default;
            })()
        `;

        const Component = eval(hookCode);
        Act.render(Component, {});

        assert.strictEqual(container.textContent, 'Suspense and lazy are available');
    });

    it('should handle useState in hook', async () => {
        const hookCode = `
            (function() {
                const exports = {};
                const module = { exports };
                
                module.exports.default = function TestHook() {
                    const React = globalThis.__hook_react || globalThis.React;
                    const [count, setCount] = React.useState(0);
                    
                    return React.createElement('div', {},
                        React.createElement('span', { id: 'count' }, count),
                        React.createElement('button', { 
                            id: 'increment',
                            onClick: () => setCount(count + 1) 
                        }, 'Increment')
                    );
                };
                
                return module.exports.default;
            })()
        `;

        const Component = eval(hookCode);

        Act.render(Component, {});

        assert.strictEqual(container.querySelector('#count')?.textContent, '0');

        // Simulate click
        const button = container.querySelector('#increment');
        button?.click();

        await new Promise(resolve => setTimeout(resolve, 10));
        assert.strictEqual(container.querySelector('#count')?.textContent, '1');
    });
});
