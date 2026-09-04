import { en } from "./en";
import { hi } from "./hi";

const enKeys = Object.keys(en);
const hiKeys = Object.keys(hi);

const missingInHi = enKeys.filter((k) => !(k in hi));
const extraInHi = hiKeys.filter((k) => !(k in en));

if (enKeys.length !== hiKeys.length || missingInHi.length > 0 || extraInHi.length > 0) {
  console.error("❌ Key parity mismatch detected!");
  if (missingInHi.length) console.error("Missing in Hindi:", missingInHi);
  if (extraInHi.length) console.error("Extra in Hindi:", extraInHi);
  process.exit(1);
} else {
  console.log("✅ i18n key parity check passed successfully!");
}