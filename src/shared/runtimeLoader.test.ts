/**
 * Tests for runtimeLoader JSX automatic runtime wrapper
 * 
 * Verifies that the jsx wrapper correctly handles the automatic JSX runtime
 * signature where the third parameter is the key, not a child.
 */

describe('runtimeLoader - JSX Automatic Runtime', () => {
    // Mock React for testing
    const mockReact = {
        createElement: (type: string, props: any, ...children: any[]) => {
            return {
                type,
                props: {
                    ...props,
                    children: children.length > 0 ? children : props?.children,
                },
                key: props?.key || null,
                ref: props?.ref || null,
            }
        },
        Fragment: Symbol('Fragment'),
    }

    // This is the wrapper function from runtimeLoader.ts
    const createJsxFactory = (React: any) => {
        if (!React || !React.createElement) return undefined
        return (type: any, config: any, maybeKey: any) => {
            let key = null
            if (maybeKey !== undefined) {
                key = String(maybeKey)
            }
            if (config && 'key' in config) {
                key = String(config.key)
                // Remove key from config before passing to createElement
                const { key: _k, ...propsWithoutKey } = config
                return React.createElement(type, { ...propsWithoutKey, key }, undefined)
            }
            // Pass key separately
            return React.createElement(type, { ...config, key }, undefined)
        }
    }

    test('creates jsx factory from React', () => {
        const jsxFactory = createJsxFactory(mockReact)
        expect(jsxFactory).toBeDefined()
        expect(typeof jsxFactory).toBe('function')
    })

    test('handles key from third parameter', () => {
        const jsxFactory = createJsxFactory(mockReact)
        const element = jsxFactory('div', { children: 'hello' }, 'key-1')

        expect(element.key).toBe('key-1')
        expect(element.props.children).toBe('hello')
    })

    test('converts numeric key to string', () => {
        const jsxFactory = createJsxFactory(mockReact)
        const element = jsxFactory('div', { children: 'hello' }, 123)

        expect(element.key).toBe('123')
    })

    test('prefers key from third parameter over config.key', () => {
        const jsxFactory = createJsxFactory(mockReact)
        const element = jsxFactory('div', { children: 'hello', key: 'config-key' }, 'param-key')

        expect(element.key).toBe('param-key')
    })

    test('handles key in config when no third parameter', () => {
        const jsxFactory = createJsxFactory(mockReact)
        const element = jsxFactory('div', { children: 'hello', key: 'config-key' }, undefined)

        expect(element.key).toBe('config-key')
    })

    test('removes key from config before passing to createElement', () => {
        const jsxFactory = createJsxFactory(mockReact)
        const element = jsxFactory('div', { children: 'hello', key: 'config-key', className: 'test' }, undefined)

        // The key should be set on element but not in props
        expect(element.key).toBe('config-key')
        expect(element.props.key).toBeUndefined()
        expect(element.props.className).toBe('test')
    })

    test('handles .map() scenario with numeric items as keys', () => {
        const jsxFactory = createJsxFactory(mockReact)

        // Simulate what SWC produces: items.map((item) => _jsx("div", { children: item }, item))
        const items = [1, 2, 3]
        const elements = items.map((item) =>
            jsxFactory('div', { children: item }, item)
        )

        expect(elements).toHaveLength(3)
        elements.forEach((el, idx) => {
            expect(el.key).toBe(String(items[idx]))
            expect(el.props.children).toBe(items[idx])
        })
    })

    test('handles .map() scenario with object keys', () => {
        const jsxFactory = createJsxFactory(mockReact)

        // Simulate: movies.map((movie) => _jsx("div", { children: movie.title }, String(movie.id)))
        const movies = [
            { id: 1, title: 'Movie 1' },
            { id: 2, title: 'Movie 2' },
        ]
        const elements = movies.map((movie) =>
            jsxFactory('div', { children: movie.title }, String(movie.id))
        )

        expect(elements).toHaveLength(2)
        expect(elements[0].key).toBe('1')
        expect(elements[0].props.children).toBe('Movie 1')
        expect(elements[1].key).toBe('2')
        expect(elements[1].props.children).toBe('Movie 2')
    })

    test('returns undefined factory for missing React', () => {
        const jsxFactory = createJsxFactory(null)
        expect(jsxFactory).toBeUndefined()
    })

    test('returns undefined factory for React without createElement', () => {
        const jsxFactory = createJsxFactory({})
        expect(jsxFactory).toBeUndefined()
    })

    test('preserves other props when key is extracted', () => {
        const jsxFactory = createJsxFactory(mockReact)
        const element = jsxFactory('div', {
            children: 'hello',
            className: 'test-class',
            id: 'test-id',
            key: 'my-key',
        }, undefined)

        expect(element.key).toBe('my-key')
        expect(element.props.className).toBe('test-class')
        expect(element.props.id).toBe('test-id')
        expect(element.props.children).toBe('hello')
        expect(element.props.key).toBeUndefined() // key should not be in props
    })
})
