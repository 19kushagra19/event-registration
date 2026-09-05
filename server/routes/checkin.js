const express = require('express');
const QRCode = require('qrcode');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { canActOnSession } = require('../utils/access');
const qrToken = require('../utils/qrToken');
const { applyTransition } = require('./registrations');

const router = express.Router();
router.use(requireAuth);

// ---- Generate a signed QR code (PNG) for a registration ----
// Encodes a full URL so scanning it with any phone camera opens the app's door-mode page
// directly (public/app.js route #/checkin/<token>), not just the raw token.
router.get('/registrations/:id/qrcode', async (req, res) => {
  const reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(req.params.id);
  if (!reg) return res.status(404).json({ error: 'Registration not found' });
  if (!canActOnSession(req.user, reg.session_id)) return res.status(403).json({ error: 'Not assigned to this session' });
  if (!['Reserved', 'Confirmed'].includes(reg.status)) {
    return res.status(400).json({ error: `Cannot issue a check-in QR code for a registration in status '${reg.status}'` });
  }

  const token = qrToken.sign(reg.id);
  const url = `${req.protocol}://${req.get('host')}/#/checkin/${token}`;
  try {
    const png = await QRCode.toBuffer(url, { width: 320, margin: 1 });
    res.setHeader('Content-Type', 'image/png');
    res.send(png);
  } catch (e) {
    res.status(500).json({ error: `Could not generate QR code: ${e.message}` });
  }
});

// ---- Scan a QR token at the door ----
// Fast-tracks Reserved/Confirmed straight to CheckedIn, reusing the exact same
// ALLOWED_TRANSITIONS state machine as the manual status-change endpoint (not a parallel path).
router.post('/checkin/scan', (req, res) => {
  const { token } = req.body || {};
  const check = qrToken.verify(token);
  if (!check.valid) return res.status(400).json({ error: `Invalid check-in code: ${check.reason}` });

  const reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(check.registrationId);
  if (!reg) return res.status(404).json({ error: 'Registration not found' });
  if (!canActOnSession(req.user, reg.session_id)) return res.status(403).json({ error: 'Not assigned to this session' });

  if (reg.status === 'CheckedIn') {
    // Idempotent on repeat scans: same person, same phone, scanned twice at a busy door.
    return res.json({ registration: reg, alreadyCheckedIn: true });
  }
  if (!['Reserved', 'Confirmed'].includes(reg.status)) {
    return res.status(409).json({ error: `Cannot check in a registration in status '${reg.status}'` });
  }

  try {
    let registration = reg;
    if (registration.status === 'Reserved') {
      registration = applyTransition(registration, 'Confirmed', req.user.email, 'Confirmed via QR check-in scan');
    }
    registration = applyTransition(registration, 'CheckedIn', req.user.email, 'Checked in via QR scan');
    res.json({ registration, alreadyCheckedIn: false });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

module.exports = router;
