# pool-drill-gen

Requires Node.js **20.18.3 or newer** and pnpm **10.33.0** (via an up-to-date Corepack).
The compiled CLI imports the canonical JSON Schema using JSON import
attributes, which became stable in Node.js 20.18.3. Earlier Node.js 20
releases either cannot load this syntax (before 20.10.0) or emit an
experimental JSON-module warning on stderr.
