// Tiny hash-router SPA, no build step, no framework. Keeps the whole submission a single
// deployable Node service. See docs/decisions.md for why.

const root = document.getElementById('root');
let ME = null; // current logged-in user, set by loadMe()

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    body: opts.body instanceof FormData ? opts.body : (opts.body ? JSON.stringify(opts.body) : undefined),
    credentials: 'same-origin',
  });
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
}
function fmt(dt) { return dt ? dt.replace('T', ' ').slice(0, 16) : ''; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ---------------- Auth ----------------
async function loadMe() {
  try { const d = await api('/auth/me'); ME = d.user; } catch { ME = null; }
}

function renderLogin() {
  root.innerHTML = '';
  root.appendChild(el(`
    <div class="login-wrap">
      <div class="login-box">
        <h2>Event Registration</h2>
        <p class="muted small">Sign in with a demo account (see SUBMISSION.md for credentials).</p>
        <div class="field"><label>Email</label><input id="li-email" type="email" value="organizer@demo.test"></div>
        <div class="field"><label>Password</label><input id="li-pass" type="password" value="password123"></div>
        <button id="li-submit" style="width:100%">Sign in</button>
        <div class="error" id="li-error"></div>
      </div>
    </div>
  `));
  document.getElementById('li-submit').onclick = async () => {
    const email = document.getElementById('li-email').value;
    const password = document.getElementById('li-pass').value;
    try {
      await api('/auth/login', { method: 'POST', body: { email, password } });
      await loadMe();
      location.hash = '#/dashboard';
      render();
    } catch (e) {
      document.getElementById('li-error').textContent = e.message;
    }
  };
}

// ---------------- Shell ----------------
function renderShell(activeRoute, contentEl) {
  root.innerHTML = '';
  const staffOnly = ME.role === 'staff';
  const shell = el(`
    <div class="app-shell">
      <div class="sidebar">
        <h1>Event Reg</h1>
        <nav>
          <a href="#/dashboard" data-r="dashboard">Dashboard</a>
          <a href="#/events" data-r="events">Events</a>
          <a href="#/registrations" data-r="registrations">Find registrations</a>
          ${staffOnly ? '<a href="#/my-sessions" data-r="my-sessions">My sessions</a>' : ''}
          <a href="#/alerts" data-r="alerts">Alerts <span id="alert-badge"></span></a>
        </nav>
        <div style="margin-top:24px;border-top:1px solid var(--border);padding-top:14px;">
          <div class="small muted">${esc(ME.name)}</div>
          <div class="small muted" style="margin-bottom:8px;">${esc(ME.role)}</div>
          <button class="secondary" id="logout-btn" style="width:100%">Log out</button>
        </div>
      </div>
      <div class="main" id="main"></div>
    </div>
  `);
  root.appendChild(shell);
  shell.querySelectorAll('nav a').forEach(a => { if (a.dataset.r === activeRoute) a.classList.add('active'); });
  document.getElementById('logout-btn').onclick = async () => { await api('/auth/logout', { method: 'POST' }); ME = null; location.hash = ''; render(); };
  document.getElementById('main').appendChild(contentEl);
  refreshAlertBadge();
}

async function refreshAlertBadge() {
  try {
    const d = await api('/alerts');
    const badge = document.getElementById('alert-badge');
    if (badge) badge.innerHTML = d.count ? `<span class="badge">${d.count}</span>` : '';
  } catch {}
}

// ---------------- Dashboard ----------------
async function viewDashboard() {
  const d = await api('/dashboard');
  const c = el(`<div>
    <h2>Dashboard</h2>
    <div class="grid-4">
      <div class="stat"><div class="num">${d.headline.sessionsToday}</div><div class="label">Sessions today</div></div>
      <div class="stat"><div class="num">${d.headline.checkedInToday}</div><div class="label">Checked in today</div></div>
      <div class="stat"><div class="num">${d.headline.expiredThisWeek}</div><div class="label">Expired this week</div></div>
      <div class="stat"><div class="num">${d.headline.atCapacity}</div><div class="label">Sessions at capacity</div></div>
    </div>
    <div class="card">
      <h3>Registrations by status</h3>
      ${d.byStatus.map(s => `<div class="row"><span class="pill ${s.status}">${s.status}</span><span>${s.count}</span></div>`).join('') || '<p class="muted">No data yet.</p>'}
    </div>
    <div class="card">
      <h3>Registrations by session</h3>
      <table><thead><tr><th>Session</th><th>Registrations</th></tr></thead><tbody>
        ${d.bySession.map(s => `<tr><td>${esc(s.title)}</td><td>${s.count}</td></tr>`).join('')}
      </tbody></table>
    </div>
    <div class="card">
      <h3>Check-ins per day (last 14 days)</h3>
      ${d.checkinsPerDay.map(r => `<div class="row"><span style="width:100px">${r.day}</span><span>${'█'.repeat(Math.min(r.count, 40))} ${r.count}</span></div>`).join('') || '<p class="muted">No check-ins yet.</p>'}
    </div>
  </div>`);
  return c;
}

// ---------------- Events ----------------
async function viewEvents() {
  const includeArchived = ME.role === 'organizer';
  const d = await api('/events' + (includeArchived ? '?includeArchived=1' : ''));
  const c = el(`<div>
    <div class="row" style="justify-content:space-between">
      <h2>Events</h2>
      ${ME.role === 'organizer' ? '<button id="new-event">+ New event</button>' : ''}
    </div>
    <div class="card"><table><thead><tr><th>Name</th><th>Dates</th><th>Venue</th><th>Status</th><th></th></tr></thead>
    <tbody>${d.events.map(e => `
      <tr>
        <td><a href="#/events/${e.id}">${esc(e.name)}</a></td>
        <td>${e.start_date} → ${e.end_date}</td>
        <td>${esc(e.venue)}</td>
        <td>${e.archived ? '<span class="pill Cancelled">Archived</span>' : '<span class="pill Confirmed">Active</span>'}</td>
        <td>${ME.role === 'organizer' ? `<button class="secondary small" data-archive="${e.id}" data-state="${e.archived}">${e.archived ? 'Restore' : 'Archive'}</button>` : ''}</td>
      </tr>`).join('')}</tbody></table></div>
  </div>`);

  if (ME.role === 'organizer') {
    c.querySelector('#new-event').onclick = () => showEventForm();
    c.querySelectorAll('[data-archive]').forEach(btn => btn.onclick = async () => {
      const id = btn.dataset.archive, archived = btn.dataset.state === '1';
      await api(`/events/${id}/${archived ? 'restore' : 'archive'}`, { method: 'POST' });
      render();
    });
  }
  return c;
}

function showEventForm(existing) {
  const modal = el(`<div class="card" style="position:fixed;top:60px;right:40px;width:340px;z-index:10;">
    <h3>${existing ? 'Edit event' : 'New event'}</h3>
    <div class="field"><label>Name</label><input id="ev-name" value="${esc(existing?.name || '')}"></div>
    <div class="field"><label>Description</label><textarea id="ev-desc">${esc(existing?.description || '')}</textarea></div>
    <div class="row">
      <div class="field"><label>Start date</label><input id="ev-start" type="date" value="${existing?.start_date || ''}"></div>
      <div class="field"><label>End date</label><input id="ev-end" type="date" value="${existing?.end_date || ''}"></div>
    </div>
    <div class="field"><label>Venue</label><input id="ev-venue" value="${esc(existing?.venue || '')}"></div>
    <div class="row"><button id="ev-save">Save</button><button class="secondary" id="ev-cancel">Cancel</button></div>
    <div class="error" id="ev-error"></div>
  </div>`);
  document.body.appendChild(modal);
  document.getElementById('ev-cancel').onclick = () => modal.remove();
  document.getElementById('ev-save').onclick = async () => {
    const body = {
      name: document.getElementById('ev-name').value,
      description: document.getElementById('ev-desc').value,
      start_date: document.getElementById('ev-start').value,
      end_date: document.getElementById('ev-end').value,
      venue: document.getElementById('ev-venue').value,
    };
    try {
      if (existing) await api(`/events/${existing.id}`, { method: 'PUT', body });
      else await api('/events', { method: 'POST', body });
      modal.remove();
      render();
    } catch (e) { document.getElementById('ev-error').textContent = e.message; }
  };
}

// ---------------- Event detail (sessions) ----------------
async function viewEventDetail(id) {
  const d = await api(`/events/${id}`);
  const c = el(`<div>
    <a href="#/events" class="small">&larr; All events</a>
    <div class="row" style="justify-content:space-between">
      <h2>${esc(d.event.name)}</h2>
      ${ME.role === 'organizer' ? '<button id="new-session">+ New session</button>' : ''}
    </div>
    <p class="muted">${d.event.start_date} → ${d.event.end_date} · ${esc(d.event.venue)}</p>
    <p>${esc(d.event.description || '')}</p>
    <div class="card"><table><thead><tr><th>Title</th><th>When</th><th>Location</th><th>Capacity</th><th></th></tr></thead>
    <tbody>${d.sessions.map(s => `
      <tr>
        <td><a href="#/sessions/${s.id}">${esc(s.title)}</a></td>
        <td>${fmt(s.start_time)} (${s.duration_minutes}m)</td>
        <td>${esc(s.location)}</td>
        <td>${s.capacity}</td>
        <td></td>
      </tr>`).join('') || '<tr><td class="muted" colspan="5">No sessions yet.</td></tr>'}</tbody></table></div>
  </div>`);
  if (ME.role === 'organizer') {
    c.querySelector('#new-session').onclick = () => showSessionForm(d.event.id);
  }
  return c;
}

function showSessionForm(eventId, existing) {
  const modal = el(`<div class="card" style="position:fixed;top:60px;right:40px;width:340px;z-index:10;">
    <h3>${existing ? 'Edit session' : 'New session'}</h3>
    <div class="field"><label>Title</label><input id="s-title" value="${esc(existing?.title || '')}"></div>
    <div class="field"><label>Start time</label><input id="s-start" type="datetime-local" value="${existing?.start_time?.replace(' ', 'T') || ''}"></div>
    <div class="field"><label>Duration (minutes)</label><input id="s-dur" type="number" value="${existing?.duration_minutes || 60}"></div>
    <div class="field"><label>Location</label><input id="s-loc" value="${esc(existing?.location || '')}"></div>
    <div class="field"><label>Capacity</label><input id="s-cap" type="number" value="${existing?.capacity || 20}"></div>
    <div class="row"><button id="s-save">Save</button><button class="secondary" id="s-cancel">Cancel</button></div>
    <div class="error" id="s-error"></div>
  </div>`);
  document.body.appendChild(modal);
  document.getElementById('s-cancel').onclick = () => modal.remove();
  document.getElementById('s-save').onclick = async () => {
    const body = {
      event_id: eventId,
      title: document.getElementById('s-title').value,
      start_time: document.getElementById('s-start').value.replace('T', ' '),
      duration_minutes: Number(document.getElementById('s-dur').value),
      location: document.getElementById('s-loc').value,
      capacity: Number(document.getElementById('s-cap').value),
    };
    try {
      if (existing) await api(`/sessions/${existing.id}`, { method: 'PUT', body });
      else await api('/sessions', { method: 'POST', body });
      modal.remove();
      render();
    } catch (e) { document.getElementById('s-error').textContent = e.message; }
  };
}

// ---------------- Session detail (registrations, import/export) ----------------
async function viewSessionDetail(id) {
  const d = await api(`/sessions/${id}`);
  const regs = await api(`/registrations?session_id=${id}&pageSize=100&sort=reserved_at&dir=desc`);
  const s = d.session;
  const c = el(`<div>
    <a href="#/events/${s.event_id}" class="small">&larr; Back to event</a>
    <h2>${esc(s.title)}</h2>
    <p class="muted">${fmt(s.start_time)} · ${s.duration_minutes} min · ${esc(s.location)}</p>
    <p><strong>${s.seats_taken} / ${s.capacity}</strong> seats held ${s.seats_taken >= s.capacity ? '<span class="pill Cancelled">FULL</span>' : ''}</p>

    <div class="card">
      <h3>Add a registration</h3>
      <div class="row">
        <div class="field"><label>Attendee name</label><input id="reg-name"></div>
        <div class="field"><label>Attendee email</label><input id="reg-email" type="email"></div>
        <button id="reg-add">Reserve seat</button>
      </div>
      <div class="error" id="reg-error"></div>
    </div>

    <div class="card">
      <h3>Bulk import (CSV: name,email)</h3>
      <input type="file" id="import-file" accept=".csv">
      <button id="import-btn">Import</button>
      <a href="/api/sessions/${s.id}/export" style="margin-left:12px" download><button class="secondary">Export check-in sheet (CSV)</button></a>
      <div id="import-report" class="small" style="margin-top:10px"></div>
    </div>

    <div class="card">
      <h3>Registrations</h3>
      <table><thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Reserved</th><th></th></tr></thead>
      <tbody id="reg-rows">
        ${regs.registrations.map(r => registrationRow(r)).join('')}
      </tbody></table>
    </div>
  </div>`);

  c.querySelector('#reg-add').onclick = async () => {
    try {
      await api(`/sessions/${id}/registrations`, { method: 'POST', body: {
        attendee_name: c.querySelector('#reg-name').value,
        attendee_email: c.querySelector('#reg-email').value,
      }});
      render();
    } catch (e) { c.querySelector('#reg-error').textContent = e.message; }
  };

  c.querySelector('#import-btn').onclick = async () => {
    const file = c.querySelector('#import-file').files[0];
    if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try {
      const result = await api(`/sessions/${id}/import`, { method: 'POST', body: fd });
      c.querySelector('#import-report').innerHTML =
        `Created: ${result.summary.created} · Duplicates: ${result.summary.duplicate} · Rejected: ${result.summary.rejected}` +
        '<ul>' + result.report.filter(r => r.result !== 'created').map(r => `<li>Row ${r.row}: ${r.result} - ${esc(r.reason)}</li>`).join('') + '</ul>';
      render();
    } catch (e) { c.querySelector('#import-report').innerHTML = `<span class="error">${esc(e.message)}</span>`; }
  };

  wireRegistrationActions(c);
  return c;
}

function registrationRow(r) {
  const next = { Reserved: ['Confirmed', 'Cancelled'], Confirmed: ['CheckedIn', 'Cancelled'], CheckedIn: [], Cancelled: [], Expired: [] }[r.status] || [];
  return `<tr data-id="${r.id}">
    <td><a href="#/registrations/${r.id}">${esc(r.attendee_name)}</a></td>
    <td>${esc(r.attendee_email)}</td>
    <td><span class="pill ${r.status}">${r.status}</span></td>
    <td>${fmt(r.reserved_at)}</td>
    <td>${next.map(n => `<button class="secondary small" data-transition="${r.id}" data-status="${n}">${n}</button>`).join(' ')}</td>
  </tr>`;
}

function wireRegistrationActions(container) {
  container.querySelectorAll('[data-transition]').forEach(btn => {
    btn.onclick = async () => {
      try {
        await api(`/registrations/${btn.dataset.transition}/status`, { method: 'POST', body: { status: btn.dataset.status } });
        render();
      } catch (e) { alert(e.message); }
    };
  });
}

// ---------------- Registration detail (timeline) ----------------
async function viewRegistrationDetail(id) {
  const d = await api(`/registrations/${id}`);
  const r = d.registration;
  const canCheckIn = ['Reserved', 'Confirmed'].includes(r.status);
  const c = el(`<div>
    <a href="#/registrations" class="small">&larr; Back to search</a>
    <h2>${esc(r.attendee_name)}</h2>
    <p class="muted">${esc(r.attendee_email)} · <span class="pill ${r.status}">${r.status}</span></p>
    <div class="card">
      <h3>Door check-in</h3>
      ${canCheckIn
        ? `<p class="small muted">Show this QR code at the door. Scanning it fast-tracks the attendee straight to Checked In.</p>
           <img id="qr-img" alt="Check-in QR code" style="width:220px;height:220px;border:1px solid var(--border);border-radius:6px" />
           <div style="margin-top:8px"><a id="qr-download" download="registration-${r.id}-qr.png"><button class="secondary">Download QR</button></a></div>`
        : `<p class="small muted">A check-in QR code isn't available once a registration is ${esc(r.status)}.</p>`}
    </div>
    <div class="card">
      <h3>Timeline</h3>
      ${d.history.map(h => `<div class="timeline-item">
        <div>${h.old_status ? `${h.old_status} → ${h.new_status}` : `Created as ${h.new_status}`} <span class="muted small">by ${esc(h.changed_by || 'system')}</span></div>
        ${h.note ? `<div class="small muted">${esc(h.note)}</div>` : ''}
        <div class="small muted">${fmt(h.changed_at)}</div>
      </div>`).join('')}
      <div style="margin-top:10px">
        <button class="secondary small" id="verify-btn">Verify audit trail</button>
        <span class="small" id="verify-result"></span>
      </div>
    </div>
    <div class="card">
      <h3>Add a note</h3>
      <textarea id="note-text" style="width:100%" rows="2"></textarea>
      <div style="margin-top:8px"><button id="note-save">Save note</button></div>
    </div>
  </div>`);
  c.querySelector('#note-save').onclick = async () => {
    await api(`/registrations/${id}/notes`, { method: 'POST', body: { note: c.querySelector('#note-text').value } });
    render();
  };
  if (canCheckIn) {
    const qrUrl = `/api/registrations/${id}/qrcode?_=${Date.now()}`;
    c.querySelector('#qr-img').src = qrUrl;
    c.querySelector('#qr-download').href = qrUrl;
  }
  c.querySelector('#verify-btn').onclick = async () => {
    const out = c.querySelector('#verify-result');
    out.textContent = 'Checking…';
    try {
      const result = await api(`/registrations/${id}/verify`);
      if (result.valid) {
        out.textContent = `✓ Audit trail intact (${result.checked} entries verified)`;
        out.className = 'small';
      } else {
        out.textContent = `✗ Tampering detected: ${result.reason}`;
        out.className = 'small error';
      }
    } catch (e) {
      out.textContent = `Error: ${e.message}`;
      out.className = 'small error';
    }
  };
  return c;
}

// ---------------- Door-mode check-in (QR scan target) ----------------
async function viewCheckin(token) {
  const c = el(`<div>
    <h2>Door check-in</h2>
    <div class="card" id="checkin-result"><p class="muted">Checking in…</p></div>
  </div>`);
  try {
    const result = await api('/checkin/scan', { method: 'POST', body: { token } });
    const r = result.registration;
    c.querySelector('#checkin-result').innerHTML = `
      <p style="font-size:1.2em">${result.alreadyCheckedIn ? 'Already checked in' : 'Checked in ✓'}</p>
      <h3>${esc(r.attendee_name)}</h3>
      <p class="muted">${esc(r.attendee_email)} · <span class="pill ${r.status}">${r.status}</span></p>
      <a href="#/registrations/${r.id}" class="small">View full record</a>
    `;
  } catch (e) {
    c.querySelector('#checkin-result').innerHTML = `<p class="error">${esc(e.message)}</p>`;
  }
  return c;
}

// ---------------- Find registrations ----------------
async function viewRegistrationsSearch() {
  const events = await api('/events?includeArchived=1').catch(() => api('/events'));
  const sessionsByEvent = Object.fromEntries(await Promise.all(events.events.map(async event => {
    const detail = await api(`/events/${event.id}`);
    return [event.id, detail.sessions];
  })));
  const state = { q: '', status: '', event_id: '', session_id: '', sort: 'reserved_at', dir: 'desc', page: 1 };

  const c = el(`<div>
    <h2>Find registrations</h2>
    <div class="card">
      <div class="row">
        <div class="field"><label>Search name/email</label><input id="f-q"></div>
        <div class="field"><label>Status</label>
          <select id="f-status"><option value="">Any</option>
            ${['Reserved','Confirmed','CheckedIn','Cancelled','Expired'].map(s => `<option value="${s}">${s}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Event</label>
          <select id="f-event"><option value="">Any</option>
            ${events.events.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Session</label>
          <select id="f-session"><option value="">Any</option></select>
        </div>
        <button id="f-apply">Search</button>
      </div>
    </div>
    <div class="card">
      <table>
        <thead><tr>
          <th data-sort="session">Session</th><th>Attendee</th>
          <th data-sort="status">Status</th><th data-sort="reserved_at">Reserved</th>
        </tr></thead>
        <tbody id="results"></tbody>
      </table>
      <div class="row" style="justify-content:space-between;margin-top:10px">
        <span id="pg-info" class="small muted"></span>
        <div><button class="secondary" id="pg-prev">Prev</button> <button class="secondary" id="pg-next">Next</button></div>
      </div>
    </div>
  </div>`);

  async function refresh() {
    const params = new URLSearchParams({ q: state.q, status: state.status, event_id: state.event_id, session_id: state.session_id, sort: state.sort, dir: state.dir, page: state.page, pageSize: 15 });
    const d = await api('/registrations?' + params.toString());
    c.querySelector('#results').innerHTML = d.registrations.map(r => `
      <tr>
        <td><a href="#/sessions/${r.session_id}">${esc(r.session_title)}</a><div class="small muted">${esc(r.event_name)}</div></td>
        <td>${esc(r.attendee_name)}<div class="small muted">${esc(r.attendee_email)}</div></td>
        <td><span class="pill ${r.status}">${r.status}</span></td>
        <td>${fmt(r.reserved_at)}</td>
      </tr>`).join('') || '<tr><td colspan="4" class="muted">No matches.</td></tr>';
    const totalPages = Math.max(Math.ceil(d.total / d.pageSize), 1);
    c.querySelector('#pg-info').textContent = `Page ${d.page} of ${totalPages} · ${d.total} total`;
    c.querySelector('#pg-prev').disabled = d.page <= 1;
    c.querySelector('#pg-next').disabled = d.page >= totalPages;
  }

  c.querySelector('#f-apply').onclick = () => {
    state.q = c.querySelector('#f-q').value;
    state.status = c.querySelector('#f-status').value;
    state.event_id = c.querySelector('#f-event').value;
    state.session_id = c.querySelector('#f-session').value;
    state.page = 1;
    refresh();
  };
  c.querySelector('#f-event').onchange = () => {
    const selected = c.querySelector('#f-event').value;
    const sessions = selected ? sessionsByEvent[selected] : Object.values(sessionsByEvent).flat();
    c.querySelector('#f-session').innerHTML = '<option value="">Any</option>' +
      sessions.map(s => `<option value="${s.id}">${esc(s.title)}</option>`).join('');
  };
  c.querySelectorAll('th[data-sort]').forEach(th => th.onclick = () => {
    const key = th.dataset.sort;
    state.dir = (state.sort === key && state.dir === 'asc') ? 'desc' : 'asc';
    state.sort = key;
    refresh();
  });
  c.querySelector('#pg-prev').onclick = () => { state.page--; refresh(); };
  c.querySelector('#pg-next').onclick = () => { state.page++; refresh(); };

  await refresh();
  return c;
}

// ---------------- My sessions (staff) ----------------
async function viewMySessions() {
  const d = await api('/staff/my-sessions');
  const c = el(`<div>
    <h2>My assigned sessions</h2>
    <div class="card"><table><thead><tr><th>Session</th><th>Event</th><th>When</th><th>Location</th></tr></thead>
    <tbody>${d.sessions.map(s => `<tr>
      <td><a href="#/sessions/${s.id}">${esc(s.title)}</a></td>
      <td>${esc(s.event_name)}</td><td>${fmt(s.start_time)}</td><td>${esc(s.location)}</td>
    </tr>`).join('') || '<tr><td class="muted" colspan="4">No assignments yet.</td></tr>'}</tbody></table></div>
  </div>`);
  return c;
}

// ---------------- Alerts ----------------
async function viewAlerts() {
  const d = await api('/alerts');
  const c = el(`<div>
    <h2>At-capacity alerts</h2>
    <div class="card">
      ${d.alerts.map(a => `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--border);padding:8px 0">
        <div><a href="#/sessions/${a.id}">${esc(a.title)}</a><div class="small muted">${esc(a.event_name)} · full since ${fmt(a.last_full_at)}</div></div>
        ${ME.role === 'organizer' ? `<button class="secondary" data-dismiss="${a.id}">Dismiss</button>` : ''}
      </div>`).join('') || '<p class="muted">No sessions currently at capacity.</p>'}
    </div>
  </div>`);
  c.querySelectorAll('[data-dismiss]').forEach(btn => btn.onclick = async () => {
    await api(`/alerts/${btn.dataset.dismiss}/dismiss`, { method: 'POST' });
    render();
  });
  return c;
}

// ---------------- Router ----------------
async function render() {
  const hash = location.hash || '#/dashboard';
  const parts = hash.slice(2).split('/'); // e.g. ['events','12']
  let route = parts[0] || 'dashboard';

  // Door check-in is reachable by scanning a QR code even if the session cookie has expired
  // mid-event, so it's handled before the ME-gate below and re-prompts for login if needed.
  if (route === 'checkin' && parts[1]) {
    if (!ME) { renderLogin(); return; }
    renderShell('checkin', await viewCheckin(decodeURIComponent(parts[1])));
    return;
  }

  if (!ME) { renderLogin(); return; }
  let content, active = route;

  try {
    if (route === 'dashboard') content = await viewDashboard();
    else if (route === 'events' && !parts[1]) content = await viewEvents();
    else if (route === 'events' && parts[1]) content = await viewEventDetail(parts[1]);
    else if (route === 'sessions' && parts[1]) content = await viewSessionDetail(parts[1]);
    else if (route === 'registrations' && parts[1]) content = await viewRegistrationDetail(parts[1]);
    else if (route === 'registrations') content = await viewRegistrationsSearch();
    else if (route === 'my-sessions') content = await viewMySessions();
    else if (route === 'alerts') content = await viewAlerts();
    else { location.hash = '#/dashboard'; return; }
  } catch (e) {
    content = el(`<div class="card error">Error: ${esc(e.message)}</div>`);
  }
  if (route.startsWith('events')) active = 'events';
  renderShell(active, content);
}

window.addEventListener('hashchange', render);
(async () => { await loadMe(); render(); })();
