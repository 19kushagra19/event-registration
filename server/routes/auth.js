const express = require('express');
const db = require('../db');
const { checkPassword, issueToken } = require('../auth');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// Accounts are provisioned directly by the organisation (the seed script does this for the
// demo). There is intentionally no public registration endpoint: otherwise any unauthenticated
// caller could create an organizer account.

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
