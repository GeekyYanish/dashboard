/**
 * Headless runner for the data-layer suite.
 *
 *     npm test
 *
 * Same assertions as /dev/data-test, same deterministic reseed. Exits non-zero
 * on any failure so it can gate a commit.
 */
import { runSuite } from "../src/frontend/screens/dev/suite";

const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

(async () => {
  const started = Date.now();
  const results = await runSuite();

  let lastGroup = "";
  for (const r of results) {
    if (r.group !== lastGroup) {
      lastGroup = r.group;
      console.log(`\n${BOLD}${r.group}${RESET}`);
    }
    const mark = r.ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    console.log(`  ${mark} ${r.name} ${DIM}${r.ms}ms${RESET}`);
    if (!r.ok) console.log(`      ${RED}${r.detail}${RESET}`);
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(
    `\n${failed ? RED : GREEN}${BOLD}${passed}/${results.length} passing${RESET}` +
      ` ${DIM}(${Date.now() - started}ms)${RESET}\n`,
  );
  process.exit(failed ? 1 : 0);
})();
