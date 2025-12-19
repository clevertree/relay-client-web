#!/usr/bin/env node
/**
 * Development server for Relay web client
 * Serves both dist/ (built web app) and relay-template/ from root
 * Checks dist/ first, falls back to relay-template/
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5174;
const BUILD_DIR = path.resolve(__dirname, 'dist');
const TEMPLATE_DIR = path.resolve(__dirname, '../../../relay-template');

const app = express();

// Middleware to serve files from both directories
app.use((req, res, next) => {
    const urlPath = req.path === '/' ? '/index.html' : req.path;

    // Try dist/ first (web app)
    const distPath = path.join(BUILD_DIR, urlPath);
    if (fs.existsSync(distPath) && fs.statSync(distPath).isFile()) {
        return res.sendFile(distPath);
    }

    // Try relay-template/ fallback
    const templatePath = path.join(TEMPLATE_DIR, urlPath);
    if (fs.existsSync(templatePath) && fs.statSync(templatePath).isFile()) {
        return res.sendFile(templatePath);
    }

    // Try index.html for directories in dist
    const distIndexPath = path.join(BUILD_DIR, urlPath, 'index.html');
    if (fs.existsSync(distIndexPath)) {
        return res.sendFile(distIndexPath);
    }

    // Try index.html for directories in relay-template
    const templateIndexPath = path.join(TEMPLATE_DIR, urlPath, 'index.html');
    if (fs.existsSync(templateIndexPath)) {
        return res.sendFile(templateIndexPath);
    }

    // Not found
    res.status(404).send('<h1>404 Not Found</h1>');
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`  dist:     ${BUILD_DIR}`);
    console.log(`  template: ${TEMPLATE_DIR}`);
    console.log('');
    console.log('Press Ctrl+C to stop');
});

process.on('SIGINT', () => {
    console.log('\nServer stopped');
    process.exit(0);
});
