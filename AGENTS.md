# AGENTS.md — ahcalc public source

ahcalc is a Bun/React Router scientific calculator for Astrohacker TermSurf,
independently versioned and installed. It does not render in generic
terminals.

The standalone workspace contains `code/ahcalc/ts/ahcalc` and the required
subset of `code/astrohacker/ts/ui`, plus local WebBuf core, fixedbuf, numbers
and rw packages under `code/webbuf/ts/`. Use the root frozen Bun lock. Build
with `bun run build`, typecheck with `bun run typecheck`, and test with
`bun run test`. The installed product must not require Bun, Node, or a
development checkout. The root build rebuilds WebBuf first; no registry
publication is needed for local edits. Keep the workspace dependency
declarations intact.

Keep the compiled `dist/ahcalc`, `build/client`, `public`, and package
manifest together. Resolve bin symlinks before resource lookup. Version and
help must work outside TermSurf without starting HTTP; opening the calculator
must explain the runtime requirement. Keep `TERMSURF_SOCKET` and
`TERMSURF_PANE_ID` protocol names intact. Product settings use `AHCALC_*`.
The version comes only from `package.json` at build time; do not accept
TermSurf or `ASTROHACKER_VERSION` overrides.

This is a managed public source mirror. Publication tooling lives in the
Astrohacker monorepo, not here. Do not edit `.ahcalc-export.json` to bypass
source-change detection. Coordinate direct source changes before the next
export.

Never rewrite history, force-push releases, or make TermSurf own the
independently installed package.
