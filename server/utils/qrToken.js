// Signed, expiring tokens for door-mode QR check-in. Deliberately NOT a bare registration id:
// ids are small sequential integers, so a bare-id QR code would let anyone at the door guess or
// increment codes to check other people in. See docs/decisions.md.
const crypto = require('crypto');

const QR_SECRET = process.env.QR_SECRET || process.env.JWT_SECRET || 'dev-secret-change-in-production';
const DEFAULT_TTL_SECONDS = 60 * 60 * 12; // a generous 12h window covers "printed the morning of"

function sign(registrationId, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${registrationId}.${expires}`;
  const sig = crypto.createHmac('sha256', QR_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

// Returns { valid: true, registrationId } or { valid: false, reason }.
function verify(token) {
  if (typeof token !== 'string' || token.split('.').length !== 3) return { valid: false, reason: 'malformed token' };
  const [idStr, expiresStr, sig] = token.split('.');
  const payload = `${idStr}.${expiresStr}`;
  const expectedSig = crypto.createHmac('sha256', QR_SECRET).update(payload).digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, reason: 'invalid signature' };
  }
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || Date.now() / 1000 > expires) {
    return { valid: false, reason: 'token expired' };
  }
  const registrationId = Number(idStr);
  if (!Number.isInteger(registrationId)) return { valid: false, reason: 'malformed token' };
  return { valid: true, registrationId };
}

module.exports = { sign, verify, DEFAULT_TTL_SECONDS };
