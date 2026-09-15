import test from "node:test";

import { verifyBrowserParity } from "../scripts/verify-browser-parity.mjs";

test("Chrome and Firefox remain part of one release contract", () => {
  verifyBrowserParity();
});
