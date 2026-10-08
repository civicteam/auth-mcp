import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The server-side entry point (`@civic/auth-mcp`) must not depend on any MCP SDK package
 * (`@modelcontextprotocol/sdk`, `@modelcontextprotocol/server`, `@modelcontextprotocol/client`, ...),
 * so that it can be used alongside any SDK generation, or with no MCP SDK installed at all.
 * Only `@civic/auth-mcp/client` may import an MCP SDK (`@modelcontextprotocol/client` v2).
 */
const SRC_DIR = __dirname;
const CLIENT_DIR = join(SRC_DIR, "client");

const isSourceFile = (file: string) => file.endsWith(".ts") && !file.endsWith(".test.ts");

const collectSourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) return collectSourceFiles(fullPath);
    return isSourceFile(fullPath) ? [fullPath] : [];
  });

/** Resolves a relative import specifier (with or without a .js suffix) to a source file path. */
const resolveRelativeImport = (fromFile: string, specifier: string): string | undefined => {
  const base = resolve(dirname(fromFile), specifier.replace(/\.js$/, ""));
  return [`${base}.ts`, join(base, "index.ts")].find(existsSync);
};

const relativeImportsOf = (file: string): string[] =>
  [...readFileSync(file, "utf8").matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)]
    .map(([, specifier]) => resolveRelativeImport(file, specifier))
    .filter((resolved): resolved is string => resolved !== undefined);

/** All source files reachable (transitively, including type-only imports) from the given roots. */
const reachableFrom = (roots: string[]): Set<string> => {
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    queue.push(...relativeImportsOf(file));
  }
  return seen;
};

const importsMcpSdk = (file: string) => /from\s+["']@modelcontextprotocol\//.test(readFileSync(file, "utf8"));

describe("MCP SDK isolation", () => {
  const serverRoots = collectSourceFiles(SRC_DIR).filter((file) => !file.startsWith(CLIENT_DIR));
  const serverGraph = [...reachableFrom(serverRoots)];

  it("includes server-side sources", () => {
    expect(serverRoots.length).toBeGreaterThan(0);
  });

  it("nothing reachable from the server-side entry point imports an @modelcontextprotocol package", () => {
    const offenders = serverGraph.filter(importsMcpSdk).map((file) => relative(SRC_DIR, file));
    expect(offenders).toEqual([]);
  });

  it("the root entry point does not re-export the client (which requires the SDK at runtime)", () => {
    const rootEntry = readFileSync(join(SRC_DIR, "index.ts"), "utf8");
    expect(rootEntry).not.toMatch(/from\s+["']\.\/client\//);
  });
});
