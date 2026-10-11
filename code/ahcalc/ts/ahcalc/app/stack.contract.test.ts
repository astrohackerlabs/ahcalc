/**
 * Ahcalc stack contract: React Router 8 + shared @astrohacker/ui.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript/package.json";
import vite from "vite/package.json";

const pkgRoot = join(import.meta.dir, "..");

describe("ahcalc stack contract (RR8 + @astrohacker/ui)", () => {
  test("package.json depends on react-router, react, and @astrohacker/ui", () => {
    const pkg = JSON.parse(
      readFileSync(join(pkgRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.["react-router"]).toBeDefined();
    expect(pkg.dependencies?.react).toBeDefined();
    expect(pkg.dependencies?.["@astrohacker/ui"]).toBe("workspace:*");
  });

  test("Exp 3: typescript 7 and vite 8 resolved", () => {
    const pkg = JSON.parse(
      readFileSync(join(pkgRoot, "package.json"), "utf8"),
    ) as { devDependencies?: Record<string, string> };
    expect(pkg.devDependencies?.typescript ?? "").toMatch(/^\^?7(\.|$)/);
    expect(pkg.devDependencies?.vite ?? "").toMatch(/^\^?8(\.|$)/);
    expect(Number(ts.version.split(".")[0])).toBe(7);
    expect(Number(vite.version.split(".")[0])).toBe(8);
  });

  test("uses shared Button and RR routes", () => {
    const calc = readFileSync(
      join(pkgRoot, "app/components/calculator.tsx"),
      "utf8",
    );
    expect(calc).toContain('from "@astrohacker/ui/button"');
    expect(calc).toContain('data-testid="ahcalc-keypad"');
    const page = readFileSync(
      join(pkgRoot, "app/components/calc-page.tsx"),
      "utf8",
    );
    expect(page).toContain('from "@astrohacker/ui/space-rain"');
    expect(page).toContain("ahcalc-space-rain");
    const routes = readFileSync(join(pkgRoot, "app/routes.ts"), "utf8");
    expect(routes).toContain("@react-router/dev/routes");
    const entry = readFileSync(join(pkgRoot, "app/entry.server.tsx"), "utf8");
    expect(entry).toContain("renderToReadableStream");
    expect(entry).not.toMatch(/renderToPipeableStream\s*\(/);
  });
});
