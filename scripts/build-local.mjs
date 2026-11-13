import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {dirname, join, resolve} from 'node:path';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// A small, explicit bundler for this app's three dependency-free source modules.
// Separate function scopes preserve private names; external ML assets stay on disk.
function bundleModule(name, source) {
  const exported = [];
  // Enumerate exports from the original source, rather than making private helpers global.
  for (const match of source.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|var)\s+(\w+)/gm)) exported.push(match[1]);
  source = source.replace(/^export\s+(?=(?:async\s+)?function\s+|(?:const|let|var)\s+)/gm, '');
  source = source.replace(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm, (_, imports, dependency) => {
    if (!['./engine.js', './coach.js'].includes(dependency)) throw new Error(`Unbundled dependency in ${name}: ${dependency}`);
    const bindings = imports.split(',').map(value => value.trim().replace(/\s+as\s+/, ':')).join(', ');
    return `const {${bindings}} = __modules[${JSON.stringify(dependency)}];`;
  });
  source = source.replace(/import\.meta\.url/g, '__moduleUrl');
  source = source.replace(/import\((['"])(\.\.?\/[^'"]+)\1\)/g, (_, quote, relative) => `import(new URL(${JSON.stringify(relative)}, __moduleUrl).href)`);
  if (/^\s*(?:export|import)\s/m.test(source)) throw new Error(`Unsupported module syntax in ${name}`);
  return `__modules[${JSON.stringify('./'+name)}] = (() => {\nconst __moduleUrl = new URL(${JSON.stringify('./dist/'+name)}, import.meta.url);\n${source}\nreturn {${exported.join(',')}};\n})();`;
}

export async function buildLocal() {
  const [template, stylesheet, engine, coach, app] = await Promise.all([
    readFile(join(projectRoot, 'dist/index.html'), 'utf8'),
    readFile(join(projectRoot, 'dist/styles.css'), 'utf8'),
    readFile(join(projectRoot, 'dist/engine.js'), 'utf8'),
    readFile(join(projectRoot, 'dist/coach.js'), 'utf8'),
    readFile(join(projectRoot, 'dist/app.js'), 'utf8')
  ]);
  const css = stylesheet.replace(/@import\s+url\((?:'[^']*'|"[^"]*"|[^)]*)\)\s*;/g, '').replace(/<\/style/gi, '<\\/style');
  const script = [
    'const __modules = Object.create(null);',
    bundleModule('engine.js', engine),
    bundleModule('coach.js', coach),
    bundleModule('app.js', app),
    `document.querySelector('#local-file-note').hidden = location.protocol !== 'file:';`
  ].join('\n\n').replace(/<\/script/gi, '<\\/script');
  const note = `<div id="local-file-note" class="notice" style="margin:18px 24px 0" hidden><strong>Local file mode.</strong> Direct-file support depends on your browser. For camera and pose analysis, run <code>npm start</code> from this folder, then open <a href="http://localhost:4173/local.html" style="text-decoration:underline">http://localhost:4173/local.html</a>. The app and model run on your computer.</div>`;
  const html = template
    .replace('href="./assets/favicon.svg"', 'href="./dist/assets/favicon.svg"')
    .replace('<link rel="stylesheet" href="./styles.css">', () => `<style>\n${css}\n</style>`)
    .replace('<main id="main"', () => `${note}\n    <main id="main"`)
    .replace('<script type="module" src="./app.js"></script>', () => `<script type="module">\n${script}\n</script>`);
  if (html === template || /<script[^>]+src=/.test(html)) throw new Error('Local HTML still depends on a core script request.');
  await writeFile(join(projectRoot, 'local.html'), html);
  return {path:join(projectRoot, 'local.html'), bytes:Buffer.byteLength(html)};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await buildLocal();
  console.log(`Built local.html (${result.bytes.toLocaleString()} bytes).`);
}
