import { builtinModules } from 'node:module';
import ts from '@typescript/typescript6';
import { readFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { files, selectedRoot, finish } from './files.mjs';
const allowed = {
  spec: [],
  spatial: ['spec'],
  core: ['spec', 'spatial'],
  simulation: ['spec', 'spatial'],
  'project-fs': ['spec', 'core', 'spatial'],
  artifacts: ['spec', 'core', 'spatial'],
  providers: ['spec'],
  agent: ['spec', 'core'],
  ingestion: ['spec'],
  'isaac-export': ['spec', 'spatial'],
  application: [
    'spec',
    'core',
    'project-fs',
    'artifacts',
    'providers',
    'agent',
    'spatial',
    'simulation',
    'ingestion',
    'isaac-export',
  ],
  desktop: ['application', 'spec', 'ingestion', 'project-fs'],
  cli: ['application', 'spec', 'core', 'project-fs', 'artifacts'],
  web: ['spec', 'spatial'],
};
const pure = new Set([
  'spec',
  'spatial',
  'core',
  'simulation',
  'artifacts',
  'ingestion',
  'isaac-export',
  'web',
]);
const native = new Set(builtinModules.flatMap((name) => [name, 'node:' + name]));
const root = selectedRoot();
const errors = [];
function owner(path) {
  return /^(?:packages|apps)\/([^/]+)\//.exec(path)?.[1];
}
for (const path of await files(root)) {
  if (!/\.[cm]?[jt]sx?$/.test(path) || !path.includes('/src/')) continue;
  const current = owner(path);
  if (!current || !Object.hasOwn(allowed, current)) {
    errors.push(`${path}: unknown source owner ${current ?? 'unowned'}.`);
    continue;
  }
  const renderer =
    current === 'desktop' &&
    (/(?:^|[/.-])renderer(?:[/.-]|$)/.test(path) || /\/parser-(?:decode|contracts)\.[cm]?[jt]s$/.test(path));
  const preload = current === 'desktop' && /(?:^|[/.-])preload(?:[/.-]|$)/.test(path);
  const source = ts.createSourceFile(
    path,
    await readFile(join(root, path), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  function inspect(node) {
    let literal;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) literal = node.moduleSpecifier;
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === 'require')
    )
      literal = node.arguments[0];
    if (literal && ts.isStringLiteralLike(literal)) {
      const name = literal.text;
      if (
        (pure.has(current) || renderer || preload) &&
        (native.has(name) ||
          name.startsWith('node:') ||
          ['electron', 'undici', 'axios', 'node-fetch'].some(
            (base) => name === base || name.startsWith(base + '/'),
          )) &&
        !(preload && name === 'electron')
      )
        errors.push(`${path}: ${current} cannot import ${name}.`);
      if (preload && name === 'electron') {
        const bindings = ts.isImportDeclaration(node) ? node.importClause?.namedBindings : undefined;
        if (
          !bindings ||
          !ts.isNamedImports(bindings) ||
          bindings.elements.some(
            (item) => !['contextBridge', 'ipcRenderer', ...(path === 'apps/desktop/src/preload.ts' ? ['webUtils'] : [])].includes((item.propertyName ?? item.name).text),
          )
        )
          errors.push(`${path}: preload may import only contextBridge and ipcRenderer from electron.`);
      }
      if (
        (renderer || preload) &&
        ((name.startsWith('@robopomelo/') &&
          !['spec', ...(renderer ? ['ingestion'] : [])].some(
            (owner) => name === '@robopomelo/' + owner || name.startsWith('@robopomelo/' + owner + '/'),
          )) ||
          (name.startsWith('.') &&
            !['native-contracts', ...(renderer ? ['parser-contracts', 'parser-decode'] : [])]
              .flatMap((name) => ['apps/desktop/src/' + name + '.js', 'apps/desktop/src/' + name + '.ts'])
              .includes(posix.normalize(posix.join(dirname(path), name)))))
      )
        errors.push(`${path}: renderer/preload cannot import host modules.`);
      const target = name.startsWith('@robopomelo/')
        ? name.split('/')[1]
        : name.startsWith('.')
          ? owner(posix.normalize(posix.join(dirname(path), name)))
          : undefined;
      if (target && target !== current && !allowed[current].includes(target))
        errors.push(`${path}: forbidden ${current} -> ${target} dependency.`);
    }
    if (
      (pure.has(current) || renderer || preload) &&
      (ts.isCallExpression(node) || ts.isNewExpression(node) || ts.isVariableDeclaration(node)) &&
      /^(?:(?:globalThis|window|self)\.)?(fetch|WebSocket|XMLHttpRequest|EventSource)$/.test(
        (ts.isVariableDeclaration(node) ? node.initializer : node.expression)?.getText(source) ?? '',
      ) &&
      current !== 'web'
    )
      errors.push(`${path}: network capability forbidden.`);
    // Native preset confirmation tokens may be minted only after a real native
    // dialog acceptance in desktop main; no route, CLI or renderer path.
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'issueNativeConfirmation' &&
      !['apps/desktop/src/native-setup.ts', 'packages/application/src/agent-grants.ts'].includes(path)
    )
      errors.push(`${path}: issueNativeConfirmation is reserved for native setup after a real native confirmation.`);
    if (
      preload &&
      ts.isCallExpression(node) &&
      node.expression.getText(source) === 'contextBridge.exposeInMainWorld' &&
      node.arguments.some((arg) => arg.getText(source) === 'ipcRenderer')
    )
      errors.push(`${path}: generic ipcRenderer exposure forbidden.`);
    ts.forEachChild(node, inspect);
  }
  inspect(source);
}
finish(errors, 'Package dependency boundaries passed.');
