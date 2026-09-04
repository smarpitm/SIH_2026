import { jsonOk } from "@/packages/shared/api";
import { publicKeyJwk, KID, keyFingerprint } from "@/lib/crypto/keys";

// GET /api/v1/public/jwks — public verification keys by kid (audit finding #45).
// Kid-selection lets verifiers (badge page, offline mode, external tools) pick
// the right key during rotation instead of trusting one global cached key.
// Rotation path: generate a new pair, set ED25519_KID to the new id, prepend
// the previous { kid, jwk } as an inactive entry here until all certificates
// signed with it have expired.
export async function GET() {
  return jsonOk({
    keys: [
      {
        kid: KID,
        active: true,
        fingerprint: keyFingerprint(),
        jwk: publicKeyJwk(),
      },
    ],
  });
}
