import crypto from "crypto";

// ============================================================================
// Token-at-rest encryption for OAuth tokens stored in `platform_tokens`.
//
// HISTORY
// v1 (legacy): AES-256-CBC with a random IV, layout `[16B IV][ciphertext]`.
//   No authentication tag — ciphertext was malleable, and the read path
//   distinguished decrypt failure from "no token" which created a padding-
//   oracle hazard.
// v2 (current): AES-256-GCM with a random IV, layout
//   `[1B version=0x02][12B IV][16B authTag][ciphertext]`. AEAD construction
//   provides both confidentiality and integrity in a single primitive.
//
// READ PATH BEHAVIOUR
// `decryptTokenFromStorage` accepts BOTH v1 and v2 ciphertexts so that
// existing rows continue to work after this code lands. Any successful v1
// decrypt should be re-encrypted with v2 by the caller (the next time the
// token is refreshed via OAuth, write back with `encryptToken`).
//
// KEY DERIVATION
// scryptSync is a deliberately slow KDF (~64 ms at default parameters). The
// previous implementation called `getDerivedKey()` once per encrypt and
// once per decrypt, which made every poll cycle do tens of synchronous
// scrypt calls and stalled the event loop. We now memoize the key once at
// module load. The salt is fixed and public — security comes from the
// secret, not the salt — so memoization is safe.
// ============================================================================

const VERSION_GCM = 0x02;
const IV_LEN_GCM = 12;
const AUTH_TAG_LEN_GCM = 16;
const IV_LEN_CBC = 16;

// ── Key derivation (memoized) ───────────────────────────────────────────────
function deriveKey(): Buffer {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET / NEXTAUTH_SECRET is not set");
  // 32-byte AES key, salt fixed/public per the security note above.
  return crypto.scryptSync(secret, "whistle-token-encryption-v1", 32);
}

// Lazy-init: don't run scrypt at import time so unit tests / build steps
// without env vars don't crash. First encrypt/decrypt populates the cache.
let keyCache: Buffer | null = null;
function getKey(): Buffer {
  if (!keyCache) keyCache = deriveKey();
  return keyCache;
}

// ── Encrypt (v2 — AES-256-GCM) ──────────────────────────────────────────────
// Layout: [version=0x02][IV(12)][authTag(16)][ciphertext]
export function encryptToken(plaintext: string): Buffer {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN_GCM);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION_GCM]), iv, authTag, ciphertext]);
}

// ── Decrypt (auto-detect v1 / v2) ───────────────────────────────────────────
// v2 layout: [0x02][IV(12)][tag(16)][ciphertext]
// v1 layout: [IV(16)][ciphertext]   (legacy — no version byte, no tag)
export function decryptToken(buf: Buffer): string {
  const key = getKey();

  // v2 path: detect via the version byte. v1 ciphertexts have no version
  // byte; their first byte is part of the IV and is uniformly random, so
  // the chance of false-matching 0x02 is 1/256. To make the heuristic
  // unambiguous, also require a length consistent with v2 (>= 1+12+16+1).
  if (
    buf.length >= 1 + IV_LEN_GCM + AUTH_TAG_LEN_GCM + 1 &&
    buf[0] === VERSION_GCM
  ) {
    try {
      const iv = buf.subarray(1, 1 + IV_LEN_GCM);
      const authTag = buf.subarray(
        1 + IV_LEN_GCM,
        1 + IV_LEN_GCM + AUTH_TAG_LEN_GCM
      );
      const ciphertext = buf.subarray(1 + IV_LEN_GCM + AUTH_TAG_LEN_GCM);
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      // GCM auth-tag mismatch ⇒ either tampering or a v1 ciphertext that
      // happens to start with 0x02. Fall through to the v1 path; if that
      // also fails, the caller sees a single failure at the bottom.
    }
  }

  // v1 fallback (legacy CBC). Only attempt this for plausibly-CBC-shaped
  // buffers — at minimum 16 bytes IV + one AES block.
  if (buf.length >= IV_LEN_CBC + 16) {
    const iv = buf.subarray(0, IV_LEN_CBC);
    const ciphertext = buf.subarray(IV_LEN_CBC);
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  }

  throw new Error("Ciphertext too short to decrypt");
}

// ── Supabase BYTEA helpers ──────────────────────────────────────────────────
// Supabase/PostgREST expects BYTEA values as a hex string with a \x prefix
// (e.g. "\xDEADBEEF"). Passing a raw Buffer gets JSON-serialized as
// {"type":"Buffer","data":[...]} which PostgreSQL rejects. Returning a
// "\x<hex>" string is the correct shape. On read, PostgREST returns BYTEA
// back in the same form, which decryptTokenFromStorage handles.
export function encryptTokenForStorage(plaintext: string): string {
  return "\\x" + encryptToken(plaintext).toString("hex");
}

export function decryptTokenFromStorage(
  stored: Buffer | string | Uint8Array
): string {
  let buf: Buffer;
  if (typeof stored === "string") {
    const hex = stored.startsWith("\\x") ? stored.slice(2) : stored;
    buf = Buffer.from(hex, "hex");
  } else {
    buf = Buffer.from(stored);
  }
  return decryptToken(buf);
}
