// Wipes and reseeds the database with enough demo data to show the system doing something.
const db = require('./db');
const { hashPassword } = require('./auth');

db.exec(`
  DELETE FROM registration_history; DELETE FROM registrations; DELETE FROM dismissed_alerts;
  DELETE FROM staff_assignments; DELETE FROM sessions; DELETE FROM events; DELETE FROM users;
`);

const insUser = db.prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?,?,?,?)');
const organizer = insUser.run('organizer@demo.test', hashPassword('password123'), 'Olivia Organizer', 'organizer');
const staff1 = insUser.run('staff1@demo.test', hashPassword('password123'), 'Sam Staff', 'staff');
const staff2 = insUser.run('staff2@demo.test', hashPassword('password123'), 'Priya Staff', 'staff');

const insEvent = db.prepare('INSERT INTO events (name, description, start_date, end_date, venue) VALUES (?,?,?,?,?)');
const conf = insEvent.run('DevSummit 2026', 'Annual engineering conference', '2026-09-10', '2026-09-11', 'Grand Hall, Downtown Center');
const workshop = insEvent.run('Product Workshop Series', 'Hands-on product workshops', '2026-10-05', '2026-10-05', 'Innovation Loft');

const insSession = db.prepare('INSERT INTO sessions (event_id, title, start_time, duration_minutes, location, capacity) VALUES (?,?,?,?,?,?)');
const s1 = insSession.run(conf.lastInsertRowid, 'Keynote: The Next Decade', '2026-09-10 09:00', 60, 'Main Stage', 3);
const s2 = insSession.run(conf.lastInsertRowid, 'Scaling Databases', '2026-09-10 11:00', 45, 'Room A', 2);
const s3 = insSession.run(conf.lastInsertRowid, 'Intro to Rust', '2026-09-11 10:00', 90, 'Room B', 25);
const s4 = insSession.run(workshop.lastInsertRowid, 'Roadmapping 101', '2026-10-05 13:00', 120, 'Loft Room 1', 15);

db.prepare('INSERT INTO staff_assignments (user_id, session_id) VALUES (?,?)').run(staff1.lastInsertRowid, s1.lastInsertRowid);
db.prepare('INSERT INTO staff_assignments (user_id, session_id) VALUES (?,?)').run(staff1.lastInsertRowid, s2.lastInsertRowid);
db.prepare('INSERT INTO staff_assignments (user_id, session_id) VALUES (?,?)').run(staff2.lastInsertRowid, s4.lastInsertRowid);

const insReg = db.prepare("INSERT INTO registrations (session_id, attendee_name, attendee_email, status) VALUES (?,?,?,?)");
const insHist = db.prepare("INSERT INTO registration_history (registration_id, old_status, new_status, changed_by, note) VALUES (?,?,?,?,?)");

function addReg(sessionId, name, email, status) {
  const r = insReg.run(sessionId, name, email, status);
  insHist.run(r.lastInsertRowid, null, 'Reserved', 'seed', 'Created');
  if (status !== 'Reserved') insHist.run(r.lastInsertRowid, 'Reserved', status, 'seed', `Moved to ${status}`);
  return r.lastInsertRowid;
}

// Fill the keynote (capacity 3) to demonstrate the at-capacity alert.
addReg(s1.lastInsertRowid, 'Alice Chen', 'alice@example.com', 'Confirmed');
addReg(s1.lastInsertRowid, 'Ben Torres', 'ben@example.com', 'CheckedIn');
addReg(s1.lastInsertRowid, 'Cara Diaz', 'cara@example.com', 'Reserved');
db.prepare(`UPDATE sessions SET currently_full = 1, last_full_at = datetime('now'), full_generation = 1 WHERE id = ?`).run(s1.lastInsertRowid);

addReg(s2.lastInsertRowid, 'Dan Ford', 'dan@example.com', 'Confirmed');
addReg(s3.lastInsertRowid, 'Eve Grant', 'eve@example.com', 'Reserved');
addReg(s3.lastInsertRowid, 'Finn Ho', 'finn@example.com', 'CheckedIn');
addReg(s4.lastInsertRowid, 'Gina Iyer', 'gina@example.com', 'Cancelled');

console.log('Seeded. Demo users:');
console.log('  organizer@demo.test / password123');
console.log('  staff1@demo.test    / password123');
console.log('  staff2@demo.test    / password123');
