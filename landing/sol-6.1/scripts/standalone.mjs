import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve(import.meta.dirname, '../dist');
let html = await readFile(resolve(directory, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)];
for (const [tag, path] of scripts) {
  const source = await readFile(resolve(directory, path), 'utf8');
  html = html.replace(tag, () => `<script type="module">${source.replace(/<\/script/gi, '<\\/script')}</script>`);
}
const styles = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="(\.\/[^\"]+)"[^>]*>/g)];
for (const [tag, path] of styles) {
  const source = await readFile(resolve(directory, path), 'utf8');
  html = html.replace(tag, () => `<style>${source}</style>`);
}
html = html.replace(/<link\b[^>]*\brel="modulepreload"[^>]*>/g, '');
html = html.replace('href="./favicon.svg"', 'href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 64 64\'%3E%3Crect width=\'64\' height=\'64\' rx=\'16\' fill=\'%23080912\'/%3E%3Ccircle cx=\'32\' cy=\'32\' r=\'16\' fill=\'none\' stroke=\'%23ded6ed\'/%3E%3C/svg%3E"');
await writeFile(resolve(directory, 'cosmos.html'), html);
console.log('Standalone page: dist/cosmos.html');
