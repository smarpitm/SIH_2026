// GET /.well-known/pramanam-public-key
// Smarpit (M7). Public verification key for consumer-trust badge (PRD #16).
// No auth. Returns raw Ed25519 public JWK + kid/alg/fingerprint for Kush
// /verify page to validate the cert embedded JWS on the client.
import { jsonOk } from "@/packages/shared/api";
import { KID, keyFingerprint, publicKeyJwk } from "@/lib/crypto/keys";

export async function GET() {
  const jwk = publicKeyJwk();
  return jsonOk({
    kty: "OKP",
    crv: "Ed25519",
    x: jwk.x,
    kid: KID,
    alg: "EdDSA",
    keyFingerprint: keyFingerprint(),
  });
}
