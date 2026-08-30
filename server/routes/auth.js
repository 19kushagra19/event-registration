const express = require('express');
const db = require('../db');
const { hashPassword, checkPassword, issueToken } = require('../auth');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// Deliberately no public self-signup: accounts for this system are provisioned by
// whoever runs the org (mirrors how the real event-ops team would onboard staff).
// The /register endpoint below is used only by the seed script; see docs/decisions.md.
router.post('/register', (req, res) => {
  const { email, password, name, role } = req.body || {};
  if (!email || !password || !name || !['organizer', 'staff'].includes(role)) {
    return res.status(400).json({ error: 'email, password, name and role (organizer|staff) are required' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const info = db.prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?,?,?,?)')
    .run(email, hashPassword(password), name, role);
  const user = { id: info.lastInsertRowid, email, name, role };
  const token = issueToken(user);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 });
  res.status(201).json({ user });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !checkPassword(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = issueToken(user);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 });
  res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
