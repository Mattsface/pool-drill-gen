import ts from 'typescript';
import { builtinModules } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const layers = ['packages/schema', 'packages/core', 'apps/cli'];
const names = layers.map((p) => JSON.parse(readFileSync(`${p}/package.json`)).name);
const builtins = new Set(builtinModules.map((n) => n.replace(/^node:/, '')));
const globals = new Set([
  'process',
  'Buffer',
  '__dirname',
  '__filename',
  'require',
  'module',
  'exports',
  'global',
  'Deno',
  'Bun',
  'setImmediate',
  'clearImmediate',
  'eval',
  'Function',
]);
// Derive DOM-only names from TypeScript's own library rather than maintaining
// an incomplete hand-written browser API list. ES2022 has no DOM library.
const dom = ts.createSourceFile(
  'lib.dom.d.ts',
  readFileSync(resolve(dirname(ts.getDefaultLibFilePath({})), 'lib.dom.d.ts'), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
);
for (const statement of dom.statements) {
  if (statement.name) globals.add(statement.name.text);
  if (ts.isVariableStatement(statement))
    for (const d of statement.declarationList.declarations)
      if (ts.isIdentifier(d.name)) globals.add(d.name.text);
}
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(`${dir}/${e.name}`)
      : /\.(?:[cm]?[jt]s|tsx)$/.test(e.name)
        ? [`${dir}/${e.name}`]
        : [],
  );
}
export function checkArchitecture(root = '.') {
  const errors = [];
  const all = layers.flatMap((p) => files(resolve(root, p, 'src')));
  const program = ts.createProgram(all, {
    allowJs: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    lib: ['lib.es2022.d.ts'],
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
  });
  const checker = program.getTypeChecker();
  for (const [layer, directory] of layers.entries()) {
    const manifest = JSON.parse(readFileSync(resolve(root, directory, 'package.json')));
    const allowed = names.slice(0, layer);
    // Neutral layers have an explicit dependency allowlist. New portable
    // dependencies require review here; platform SDKs cannot slip in unnoticed.
    const permitted = layer === 2 ? [...allowed, 'commander'] : allowed;
    for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const dependency of Object.keys(manifest[section] ?? {})) {
        if (!permitted.includes(dependency))
          errors.push(`${directory}/package.json: prohibited ${section} dependency ${dependency}`);
      }
    }
    for (const filename of all.filter((f) => f.startsWith(resolve(root, directory, 'src') + '/'))) {
      const source = program.getSourceFile(filename);
      const report = (node, message) => {
        const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
        errors.push(`${relative(root, filename)}:${line + 1}:${character + 1}: ${message}`);
      };
      const dependency = (node, specifier) => {
        if (!specifier || !ts.isStringLiteralLike(specifier))
          return report(node, 'module specifier must be a static string');
        const name = specifier.text;
        if (name.startsWith('.')) {
          const target = resolve(dirname(filename), name);
          const destinations = [directory, ...layers.slice(0, layer)].flatMap((p) =>
            ['src', 'dist'].map((d) => resolve(root, p, d) + '/'),
          );
          if (!destinations.some((p) => target.startsWith(p)))
            report(node, `dependency crosses layer boundary: ${name}`);
        } else if (layer < 2 && (name.startsWith('node:') || builtins.has(name))) {
          report(node, `Node built-in prohibited: ${name}`);
        } else if (
          !permitted.some((p) => name === p || name.startsWith(p + '/')) &&
          !(layer === 2 && (name.startsWith('node:') || builtins.has(name)))
        ) {
          report(node, `unapproved runtime dependency: ${name}`);
        }
      };
      const visit = (node) => {
        if (ts.isImportDeclaration(node) || (ts.isExportDeclaration(node) && node.moduleSpecifier))
          dependency(node, node.moduleSpecifier);
        if (
          ts.isImportEqualsDeclaration(node) &&
          ts.isExternalModuleReference(node.moduleReference)
        )
          dependency(node, node.moduleReference.expression);
        if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
        )
          dependency(node, node.arguments[0]);
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          ['compile', 'compileAsync'].includes(node.expression.name.text)
        )
          report(
            node,
            'runtime schema compilation prohibited; use the generated standalone validator',
          );
        if (
          ts.isElementAccessExpression(node) &&
          ts.isIdentifier(node.expression) &&
          ['globalThis', 'window', 'self'].includes(node.expression.text) &&
          layer < 2
        ) {
          if (
            !ts.isStringLiteralLike(node.argumentExpression) ||
            globals.has(node.argumentExpression.text)
          )
            report(node, 'computed platform global prohibited');
        }
        if (
          ts.isIdentifier(node) &&
          globals.has(node.text) &&
          (layer < 2 || ['eval', 'Function'].includes(node.text))
        ) {
          // Property names and locally bound identifiers are not runtime globals.
          const parent = node.parent;
          const property =
            (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
            ((ts.isPropertyAssignment(parent) ||
              ts.isMethodDeclaration(parent) ||
              ts.isPropertySignature(parent)) &&
              parent.name === node);
          const symbol = ts.isShorthandPropertyAssignment(parent)
            ? checker.getShorthandAssignmentValueSymbol(parent)
            : checker.getSymbolAtLocation(node);
          const local = symbol?.declarations?.some(
            (d) =>
              !program.isSourceFileDefaultLibrary(d.getSourceFile()) &&
              !d.getSourceFile().fileName.includes('node_modules'),
          );
          if (!property && !local) report(node, `platform global prohibited: ${node.text}`);
          if (
            property &&
            ts.isPropertyAccessExpression(parent) &&
            ts.isIdentifier(parent.expression) &&
            ['globalThis', 'window', 'self'].includes(parent.expression.text)
          )
            report(node, `platform global prohibited: ${parent.getText(source)}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  return errors;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const errors = checkArchitecture();
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else console.log('Architecture boundaries passed.');
}
