const { verifyToken } = require('../auth');

module.exports = function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.token;
  const user = token && verifyToken(token);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  req.user = user;
  next();
};
