import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const dist = resolve('dist');
const load = (file) => readFile(resolve(dist, file));
const encode = async (file, type) => 'data:' + type + ';base64,' + (await load(file)).toString('base64');
const doc = (await load('index.html')).toString('utf8');
const module = /<script\s+type="module"[^>]*\ssrc="([^"]+)"[^>]*><\/script>/;
const stylesheet = /<link\s+rel="stylesheet"[^>]*\shref="([^"]+)"[^>]*>/;
const source = doc.match(module)?.[1];
const style = doc.match(stylesheet)?.[1];
if (!source || !style) throw new Error('Le module ou la feuille de style Vite est introuvable.');

const [result, css, cover, icon] = await Promise.all([
  build({ entryPoints: [resolve(dist, source)], bundle: true, format: 'esm', write: false, target: 'es2022', minify: true }),
  load(style),
  encode('cover.webp', 'image/webp'),
  encode('favicon.png', 'image/png'),
]);
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const inlineCss = css.toString('utf8').replace(/url\((?:["']?)(?:[^)"']*\/)?cover\.webp(?:["']?)\)/g, 'url(' + cover + ')');
const html = doc.replace(/\s*<link rel="modulepreload"[^>]*>/g, '')
  .replace(module, '')
  .replace(stylesheet, () => '<style>' + inlineCss + '</style>')
  .replace(/href="[^"]*favicon\.png"/, () => 'href="' + icon + '"')
  .replace('</body>', () => '<script type="module">' + script + '</script>\n</body>');

await mkdir('outputs', { recursive: true });
await writeFile('outputs/DeadLine.html', html);
console.log('Version autonome créée dans outputs/DeadLine.html');
