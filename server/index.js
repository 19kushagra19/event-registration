const app = require('./app');
const { expireStale } = require('./utils/lifecycle');

// Belt-and-braces background sweep, on top of the defensive expireStale() calls
// inside each capacity-sensitive route. Runs every minute.
setInterval(() => {
  try { expireStale(); } catch (e) { console.error('expireStale sweep failed', e); }
}, 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Event registration server listening on :${PORT}`));
