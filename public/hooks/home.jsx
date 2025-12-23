import React from 'react'

export default function Home() {
    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">Home</h1>
            <p>Welcome to Relay Web Client</p>
            <p className="mt-2">This entire UI is rendered via transpiled JSX using hook-transpiler + themed-styler!</p>
        </div>
    )
}
