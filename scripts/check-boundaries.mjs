import ts from '@typescript/typescript6';
import { readFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { files, selectedRoot, finish } from './files.mjs';
const allowed = { spec: [], core: ['spec'], 'project-fs': ['spec', 'core'], artifacts: ['spec', 'core'], cli: ['spec', 'core', 'project-fs', 'artifacts'], web: ['spec'] };
const root = selectedRoot();
const errors = [];
function owner(path) { return /^(?:packages|apps)\/([^/]+)\//.exec(path)?.[1]; }
for (const path of await files(root)) {
  if (!/\.[cm]?[jt]sx?$/.test(path) || !path.includes('/src/')) continue;
  const current = owner(path);
  if (!current || !allowed[current]) continue;
  const source = ts.createSourceFile(path, await readFile(join(root, path), 'utf8'), ts.ScriptTarget.Latest, true);
  function inspect(node) {
    let literal;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) literal = node.moduleSpecifier;
    else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === 'require')) literal = node.arguments[0];
    if (literal && ts.isStringLiteralLike(literal)) {
      const name = literal.text;
      if (['spec', 'core', 'artifacts', 'web'].includes(current) && (name.startsWith('node:') || /^(fs|http|https|net|tls|child_process|dns|os|path)(\/|$)/.test(name))) errors.push(`${path}: ${current} cannot import ${name}.`);
      const target = name.startsWith('@robopomelo/') ? name.split('/')[1] : name.startsWith('.') ? owner(posix.normalize(posix.join(dirname(path), name))) : undefined;
      if (target && target !== current && !allowed[current].includes(target)) errors.push(`${path}: forbidden ${current} -> ${target} dependency.`);
    }
    ts.forEachChild(node, inspect);
  }
  inspect(source);
}
finish(errors, 'Package dependency boundaries passed.');
