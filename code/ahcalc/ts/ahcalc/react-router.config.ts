import type { Config } from "@react-router/dev/config";

/**
 * SPA mode: client build is self-contained under build/client.
 * Compiled `dist/ahcalc --server` serves those files with pure Bun.file —
 * no dynamic import of react-router from the standalone binary (that broke
 * auto-spawn lifecycle after the RR rewrite).
 */
export default {
  ssr: false,
} satisfies Config;
