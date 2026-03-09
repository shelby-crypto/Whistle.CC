import crypto from "crypto";

// ── Key derivation ─────────────────────────────────────────────────────────
// NEXTAUTH_SECRET is the master secret. We derive a fixed 32-byte AES key
// from it using scryptSync so the encryption key is always deterministic
// and doesn't need to be stored separately.

function getDerivedKey(): Buffer {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET / NEXTAUTH_SECRET is not set");
  // salt is fixed and public — security comes from the secret, not the salt
  return crypto.scryptSync(secret, "whistle-token-encryption-v1", 32);
}

// ── Encrypt ────────────────────────────────────────────────────────────────
// Returns a Buffer containing: [16-byte IV][encrypted ciphertext]
// The IV is prepended so it travels with the ciphertext and can be extracted
// at decrypt time without separate storage.

export function encryptToken(plaintext: string): Buffer {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  // Prepend IV to ciphertext
  return Buffer.concat([iv, encrypted]);
}

// ── Decrypt ────────────────────────────────────────────────────────────────
// Accepts the Buffer produced by encryptToken (IV prepended).
// Returns the original plaintext string.

export function decryptToken(encryptedBuffer: Buffer): string {
  const key = getDerivedKey();
  const iv = encryptedBuffer.subarray(0, 16);
  const ciphertext = encryptedBuffer.subarray(16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

// ── Supabase helpers ───────────────────────────────────────────────────────
// Supabase/PostgREST expects BYTEA values as a hex string with a \x prefix
// (e.g. "\xDEADBEEF"). Passing a raw Buffer gets JSON-serialized by Node.js
// as {"type":"Buffer","data":[...]} which PostgreSQL rejects or stores as
// garbage. Returning a string in \x<hex> format is the correct approach.
//
// On read, PostgREST returns BYTEA back as the same \x<hex> format, which
// decryptTokenFromStorage already handles.

export function encryptTokenForStorage(plaintext: string): string {
  return "\\x" + encryptToken(plaintext).toString("hex");
}

export function decryptTokenFromStorage(
  stored: Buffer | string | Uint8Array
): string {
  let buf: Buffer;
  if (typeof stored === "string") {
    // Supabase BYTEA arrives as hex string: "\\xDEADBEEF..."
    const hex = stored.startsWith("\\x") ? stored.slice(2) : stored;
    buf = Buffer.from(hex, "hex");
  } else {
    buf = Buffer.from(stored);
  }
  return decryptToken(buf);
}
