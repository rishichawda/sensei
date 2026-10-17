import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

// Renders one SVG to a PNG at 2x. Called by render-svg.sh, which has already
// confined both paths; the message on failure is what the maker agent reads.
const [src, out] = process.argv.slice(2);
try {
  const png = new Resvg(readFileSync(src), { fitTo: { mode: "zoom", value: 2 } }).render().asPng();
  writeFileSync(out, png);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
