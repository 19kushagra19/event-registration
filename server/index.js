const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { expireStale } = require('./utils/lifecycle');

const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const sessionRoutes = require('./routes/sessions');
const staffRoutes = require('./routes/staff');
const registrationRoutes = require('./routes/registrations');
const dashboardRoutes = require('./routes/dashboard');
const alertRoutes = require('./routes/alerts');

const app = express();
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/alerts', alertRoutes);
// registrations.js defines its own /sessions/:id/... and /registrations/... paths under /api
app.use('/api', registrationRoutes);

// Serve the frontend (single Node service; see docs/decisions.md on why we didn't split
// frontend/backend hosting for this submission).
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Belt-and-braces background sweep, on top of the defensive expireStale() calls
// inside each capacity-sensitive route. Runs every minute.
setInterval(() => {
  try { expireStale(); } catch (e) { console.error('expireStale sweep failed', e); }
}, 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Event registration server listening on :${PORT}`));
