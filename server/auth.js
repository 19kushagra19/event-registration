const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}
function checkPassword(pw, hash) {
  return bcrypt.compareSync(pw, hash);
}
function issueToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
}
function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

module.exports = { hashPassword, checkPassword, issueToken, verifyToken };
