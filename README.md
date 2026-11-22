# pool-drill-gen

Requires Node.js **20.18.3 or newer** and pnpm **10.33.0** (via an up-to-date Corepack).
The compiled CLI imports the canonical JSON Schema using JSON import
attributes, which became stable in Node.js 20.18.3. Earlier Node.js 20
releases either cannot load this syntax (before 20.10.0) or emit an
experimental JSON-module warning on stderr.

Install pnpm 10.33.0 directly on `PATH`, then run:

```sh
pnpm install --frozen-lockfile
pnpm verify
```

`verify` runs the same gates as CI, in order:

- `check:generated`: regenerate types and the standalone validator, then compare
  the entire `packages/schema/src/generated` directory against Git HEAD (including
  added/deleted files). This runs **before** build, because schema build also
  generates artifacts. A second comparison after build ensures it changed nothing.
  On drift, run `pnpm schema:generate`, review, and commit the generated changes
  alongside the canonical schema. CI never commits them.
- `check:architecture` and `test:checks`: syntax-aware TypeScript analysis and its
  regression tests. Production schema/core sources reject Node built-ins,
  unbound Node/DOM globals, dynamic module specifiers, application imports, and
  unapproved external dependencies. Source paths and runtime manifest dependencies
  enforce schema → core → CLI consumption. Neutral packages use an explicit
  dependency allowlist; adding a portable dependency requires reviewing that list.
  Runtime Ajv/compiler dependencies, code generation (`eval`/`Function`), and
  `.compile()`/`.compileAsync()` calls are prohibited; schema generator tooling is
  outside the production scan. Comments, strings, and local bindings are ignored.
- `build` and `test`: production TypeScript project references, existing core/CLI
  test type-checking, and all schema/core/CLI tests. No duplicate production
  type-check command is needed.
- `check:browser`: esbuild bundles the actual core and schema `dist/index.js`
  exports for browser/ES2022 ESM, including the standalone validator and schema
  data. No externals or polyfills are supplied. It rejects schema compiler bundle
  inputs and executes representative validation, migration, and geometry calls in
  a fresh VM context without Node APIs, DOM, or dynamic code generation. Bundle
  errors identify the import chain; remove the platform dependency from production
  code, rebuild, and retry. Run `pnpm build` first when using this check alone.
- `test:smoke`: launches the compiled CLI in child processes. Covers all five M1.9
  canonical fixtures, M1.10 unknown fields (lenient and strict), and schema,
  semantic, malformed JSON, and missing-file failures, checking exit status and
  stdout/stderr contracts. Build first when running this alone.

CI runs on pull requests to `main`, pushes to `main`, and manual dispatch, with
independent Linux matrix jobs for Node **20.18.3** and **24**, pnpm **10.33.0**,
lockfile-based dependency caching, frozen installation, and read-only permissions.
External actions are pinned by commit SHA.

Node 20.18.3's bundled Corepack has outdated registry signing keys and can fail
with `Cannot find matching keyid`. Use a current compatible Corepack or install
pnpm 10.33.0 directly; CI uses `pnpm/action-setup` and does not depend on bundled
Corepack. The lockfile also contains Rollup's optional Linux build-tool dependency
`@napi-rs/lzma-linux-x64-gnu`, whose engine range starts at Node 22.20; it is not a
runtime dependency of this project and pnpm can skip it on Node 20. The full
minimum-runtime CI job remains required.

For opt-in failure injection, run `pnpm verify:negative` with no concurrent
builds/tests. It temporarily mutates generator outputs, source, tests, and compiled
entries, requires each gate to fail with the expected diagnostic, restores bytes
in `finally`, and rebuilds. Intentional violations are never committed.

These gates are compatibility evidence, not a full browser/Cloudflare Worker
execution suite or an independent architecture audit. Static analysis cannot
prove arbitrary obfuscated runtime behavior; the bundle gate covers the reachable
compiled dependency graph, and the API probe exercises representative paths.
