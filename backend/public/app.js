// Brickwest Brewmaster web app. Plain modules, no build step. Every node is
// created with h() and text goes in as text, never as HTML, so nothing a
// brewer types can run as script (the page's Content-Security-Policy backs
// that up).

import { quip, greeting, taskToast, installEasterEggs } from './brand.js';

import { scanView, stopScanning } from './scanning.js';
const STATUSES = ['milling', 'mashing', 'boiling', 'cooling', 'fermenting', 'packaging', 'complete'];
const store = {
  get token() { return localStorage.getItem('bw.token'); },
  get user() { try { return JSON.parse(localStorage.getItem('bw.user')); } catch { return null; } },
  save(token, user) { localStorage.setItem('bw.token', token); localStorage.setItem('bw.user', JSON.stringify(user)); },
  clear() { localStorage.removeItem('bw.token'); localStorage.removeItem('bw.user'); }
};

// ---- DOM helpers -----------------------------------------------------------
function h(tag, props = {}, ...children) {
  const isSvg = ['svg', 'polyline', 'circle', 'line', 'text'].includes(tag);
  const node = isSvg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.setAttribute('class', value);
    else if (!isSvg && key in node && key !== 'list' && key !== 'form') node[key] = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

const app = document.getElementById('app');
const toastBox = document.getElementById('toast');
let toastTimer;
function toast(message) {
  toastBox.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastBox.textContent = ''; }, 3500);
}

const fmtDate = value => (value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const fmtDateTime = value => new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtNumber = value => (value == null || value === '' ? '—' : String(Number(value)));
const label = text => String(text).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const statusTag = (text, cls = text) => h('span', { class: `status ${cls}` }, label(text));

// ---- API -------------------------------------------------------------------
class ApiError extends Error {}

async function api(method, path, body) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(store.token ? { Authorization: `Bearer ${store.token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    const error = new ApiError('Could not reach the server. Check your connection and try again.');
    error.offline = true;
    throw error;
  }
  const data = await response.json().catch(() => null);
  if (response.status === 401 && store.token && !path.startsWith('/auth/')) {
    store.clear();
    render();
    throw new ApiError('Your session ended. Sign in again.');
  }
  if (!response.ok) throw new ApiError(data?.error || `Request failed (${response.status})`);
  return data;
}

// ---- Forms and dialogs -----------------------------------------------------
// fields: [{ name, label, type, required, options, hint, wide, value, step, min }]
// Empty optional fields are left out of the payload; numbers are sent as numbers.
function buildForm({ fields, submit, onSubmit, onCancel }) {
  const error = h('p', { class: 'form-error', role: 'alert' });
  const button = h('button', { type: 'submit' }, submit);
  const controls = fields.map(field => {
    let control;
    const common = { name: field.name, required: field.required, id: `f-${field.name}-${Math.random().toString(36).slice(2, 7)}` };
    if (field.type === 'select') {
      control = h('select', common, field.options.map(o => h('option', { value: o.value, selected: String(o.value) === String(field.value ?? '') }, o.label)));
    } else if (field.type === 'textarea') {
      control = h('textarea', { ...common, placeholder: field.placeholder }, field.value ?? '');
    } else {
      control = h('input', {
        ...common, type: field.type || 'text', value: field.value ?? '', placeholder: field.placeholder,
        step: field.type === 'number' ? (field.step || 'any') : undefined, min: field.min,
        autocomplete: field.autocomplete, inputMode: field.type === 'number' ? 'decimal' : undefined
      });
    }
    return h('label', { class: field.wide ? 'wide' : '', for: common.id },
      field.label, field.hint ? h('span', { class: 'hint' }, ` (${field.hint})`) : null, control);
  });

  const form = h('form', {
    onsubmit: async event => {
      event.preventDefault();
      const values = {};
      for (const field of fields) {
        const raw = form.elements[field.name].value.trim();
        if (raw === '') continue;
        values[field.name] = field.type === 'number' || field.numeric ? Number(raw) : raw;
      }
      error.textContent = '';
      button.disabled = true;
      try {
        await onSubmit(values, form);
      } catch (err) {
        error.textContent = err instanceof ApiError ? err.message : 'Something went wrong. Try again.';
        if (!(err instanceof ApiError)) console.error(err);
      } finally {
        button.disabled = false;
      }
    }
  },
  h('div', { class: 'fields' }, controls),
  h('div', { class: 'form-foot' }, button,
    onCancel ? h('button', { type: 'button', class: 'quiet', onclick: onCancel }, 'Cancel') : null, error));
  return form;
}

function openDialog(title, options) {
  const dialog = h('dialog', { 'aria-label': title });
  const close = () => { dialog.close(); dialog.remove(); };
  dialog.append(h('h2', {}, title), options.intro ? h('p', { class: 'muted' }, options.intro) : '', buildForm({
    ...options,
    onCancel: close,
    onSubmit: async values => { await options.onSubmit(values); close(); }
  }));
  dialog.addEventListener('cancel', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

function table(headers, rows, emptyText) {
  if (!rows.length) return h('p', { class: 'empty' }, emptyText);
  return h('div', { class: 'table-wrap' }, h('table', {},
    h('thead', {}, h('tr', {}, headers.map(head => h('th', { class: head.num ? 'num' : '', scope: 'col' }, head.label ?? head)))),
    h('tbody', {}, rows)));
}
const cell = (content, num) => h('td', { class: num ? 'num' : '' }, content);

// ---- Checklist steps that could not be sent yet --------------------------------
// A step recorded with no signal is kept on this device and sent later. Each
// one carries an id made here, so the server stores it once however many times
// it is retried.
const outbox = {
  read() { try { return JSON.parse(localStorage.getItem('bw.outbox')) || []; } catch { return []; } },
  write(items) { localStorage.setItem('bw.outbox', JSON.stringify(items)); },
  add(item) { this.write([...this.read(), item]); },
  has(runId, stepId) { return this.read().some(i => i.runId === runId && i.stepId === stepId); },
  async flush() {
    let sent = 0;
    for (const item of this.read()) {
      try {
        await api('POST', `/checklists/runs/${item.runId}/steps/${item.stepId}`, item.body);
        sent += 1;
      } catch (err) {
        if (err.offline) break;
        toast(`A saved checklist step was not accepted: ${err.message}`);
      }
      this.write(this.read().filter(i => i.body.client_event_id !== item.body.client_event_id));
    }
    return sent;
  }
};

async function recordStep(run, step, body) {
  const payload = { ...body, client_event_id: crypto.randomUUID(), performed_at: new Date().toISOString() };
  try {
    await api('POST', `/checklists/runs/${run.id}/steps/${step.id}`, payload);
    return 'sent';
  } catch (err) {
    if (!err.offline) throw err;
    outbox.add({ runId: run.id, stepId: step.id, body: payload });
    return 'queued';
  }
}

const rangeText = step => {
  const unit = step.value_unit ? ` ${step.value_unit}` : '';
  if (step.value_min != null && step.value_max != null) return `Expected ${fmtNumber(step.value_min)} to ${fmtNumber(step.value_max)}${unit}`;
  if (step.value_min != null) return `Expected at least ${fmtNumber(step.value_min)}${unit}`;
  if (step.value_max != null) return `Expected at most ${fmtNumber(step.value_max)}${unit}`;
  return step.requires_value ? `Record the value${unit ? ` in${unit}` : ''}` : '';
};
const STEP_WORDS = { done: 'Done', skipped: 'Skipped', exception: 'Problem', reopened: 'Reopened' };

function checklistRun(run) {
  const askReason = (title, submit, onReason, intro) => openDialog(title, {
    intro, submit, fields: [{ name: 'note', label: 'Reason', required: true, wide: true, type: 'textarea' }],
    onSubmit: values => onReason(values.note)
  });

  const stepRow = step => {
    const row = h('li', { class: `step ${step.state}` });
    const send = async body => {
      const outcome = await recordStep(run, step, body);
      if (outcome === 'queued') {
        toast('No connection. Saved on this device and will send when you are back online.');
        row.replaceChildren(h('div', { class: 'step-main' }, h('b', {}, step.title), h('span', { class: 'when' }, 'Waiting to send')), statusTag('Saved here', 'in_progress'));
      } else { toast('Step recorded'); render(); }
    };
    const guarded = action => async () => { try { await action(); } catch (err) { toast(err.message); } };

    if (outbox.has(run.id, step.id)) {
      row.append(h('div', { class: 'step-main' }, h('b', {}, step.title), h('span', { class: 'when' }, 'Waiting to send')), statusTag('Saved here', 'in_progress'));
      return row;
    }

    if (step.state === 'pending') {
      const input = step.requires_value
        ? h('input', { type: 'number', step: 'any', inputMode: 'decimal', class: 'step-value', 'aria-label': `${step.title}${step.value_unit ? `, ${step.value_unit}` : ''}`, placeholder: step.value_unit || 'Value' })
        : null;
      const done = guarded(async () => {
        const body = { status: 'done' };
        if (input) {
          if (input.value.trim() === '') { input.focus(); return toast('Enter the measured value first.'); }
          body.measured_value = Number(input.value);
          const low = step.value_min != null && body.measured_value < Number(step.value_min);
          const high = step.value_max != null && body.measured_value > Number(step.value_max);
          if (low || high) {
            return askReason('That value is outside the expected range', 'Record with note', note => send({ ...body, note }),
              `${rangeText(step)}. You entered ${body.measured_value}. Say what happened so it is on the record.`);
          }
        }
        await send(body);
      });
      row.append(
        h('div', { class: 'step-main' }, h('b', {}, step.title), rangeText(step) ? h('span', { class: 'when' }, rangeText(step)) : null),
        h('div', { class: 'actions' }, input,
          h('button', { class: 'small', onclick: done }, 'Done'),
          h('button', { class: 'quiet small', onclick: () => askReason(`Skip "${step.title}"`, 'Skip step', note => send({ status: 'skipped', note })) }, 'Skip'),
          h('button', { class: 'danger small', onclick: () => askReason(`Report a problem with "${step.title}"`, 'Report problem', note => send({ status: 'exception', note }), 'The step is marked as a problem and stays visible to the team.') }, 'Problem')));
      return row;
    }

    const latest = step.latest;
    const flagged = step.state === 'exception' || latest.out_of_range;
    row.append(
      h('div', { class: 'step-main' },
        h('b', {}, step.title),
        h('span', { class: 'when' },
          latest.measured_value != null ? `${fmtNumber(latest.measured_value)}${step.value_unit ? ` ${step.value_unit}` : ''}, ` : '',
          `${latest.operator_name}, ${fmtDateTime(latest.performed_at)}`),
        latest.note ? h('span', { class: 'note' }, latest.note) : null,
        step.history.length > 1 ? h('details', {}, h('summary', {}, `History, ${step.history.length} entries`),
          h('ul', { class: 'history' }, step.history.map(e => h('li', {},
            `${STEP_WORDS[e.status]}`, e.measured_value != null ? ` ${fmtNumber(e.measured_value)}${step.value_unit ? ` ${step.value_unit}` : ''}` : '',
            ` by ${e.operator_name}, ${fmtDateTime(e.performed_at)}`, e.note ? `. ${e.note}` : '')))) : null),
      h('div', { class: 'actions' },
        latest.out_of_range && step.state === 'done' ? statusTag('Out of range', 'low') : statusTag(STEP_WORDS[step.state], flagged ? 'low' : step.state === 'done' ? 'done' : ''),
        h('button', { class: 'quiet small', onclick: () => askReason(`Reopen "${step.title}"`, 'Reopen step', note => send({ status: 'reopened', note }), 'The earlier entry stays in the history.') }, 'Reopen')));
    return row;
  };

  const recorded = run.total_steps - run.remaining_steps;
  return h('div', { class: 'run' },
    h('div', { class: 'run-head' },
      h('h3', {}, `${run.name}, version ${run.version}`),
      h('p', { class: 'muted' }, run.complete ? `All ${run.total_steps} steps recorded` : `${recorded} of ${run.total_steps} steps recorded`,
        run.exceptions ? `, ${run.exceptions} flagged` : '', `. Started by ${run.started_by_name}.`)),
    h('ol', { class: 'checklist' }, run.steps.map(stepRow)));
}

// "Mash-in temperature = °C 64-68" -> a measured step with a unit and range.
function parseSteps(text) {
  return text.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const match = line.match(/^(.*?)\s*=\s*([^\s\d-][^\s]*)?\s*(?:(-?[\d.]+)\s*(?:to|-|–)\s*(-?[\d.]+))?$/);
    if (!match || !match[1]) return { title: line };
    const step = { title: match[1].trim(), requires_value: true };
    if (match[2]) step.value_unit = match[2];
    if (match[3] != null) { step.value_min = Number(match[3]); step.value_max = Number(match[4]); }
    return step;
  });
}
const stepLine = step => (step.requires_value
  ? `${step.title} = ${step.value_unit || ''}${step.value_min != null && step.value_max != null ? ` ${fmtNumber(step.value_min)}-${fmtNumber(step.value_max)}` : ''}`.trim()
  : step.title);

async function checklistsView() {
  const templates = await api('GET', '/checklists/templates');
  const stageOptions = [{ value: '', label: 'Any stage' }, ...STATUSES.map(s => ({ value: s, label: label(s) }))];

  const edit = template => openDialog(template ? `Edit ${template.name}` : 'New checklist', {
    intro: template ? `Saving creates version ${template.version + 1}. Batches already using version ${template.version} keep it.` : null,
    submit: template ? 'Save new version' : 'Save checklist',
    fields: [
      { name: 'name', label: 'Name', required: true, value: template?.name, placeholder: 'Mash-in SOP' },
      { name: 'stage', label: 'Used at', type: 'select', value: template?.stage ?? '', options: stageOptions },
      { name: 'steps', label: 'Steps', type: 'textarea', wide: true, required: true, value: template?.steps.map(stepLine).join('\n'),
        hint: 'one per line; for a measurement add = unit and range', placeholder: 'Check mill gap\nMash-in temperature = °C 64-68\nSanitise transfer hose' }
    ],
    onSubmit: async values => {
      await api('POST', '/checklists/templates', { ...values, name: template ? template.name : values.name, steps: parseSteps(values.steps) });
      toast(template ? 'New version saved' : 'Checklist saved'); render();
    }
  });

  const retire = async template => {
    if (!confirm(`Retire "${template.name}"? Batches already using it keep their record.`)) return;
    try { await api('DELETE', `/checklists/templates/${template.id}`); toast('Checklist retired'); render(); } catch (err) { toast(err.message); }
  };

  return h('div', {},
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Checklists'), h('p', {}, 'Standard steps for each stage of a brew day. Start one from a batch.')),
      h('button', { onclick: () => edit() }, 'New checklist')),
    templates.length
      ? templates.map(t => h('section', { class: 'panel template' },
        h('div', { class: 'section-head' },
          h('h2', {}, t.name),
          h('div', { class: 'actions' }, h('button', { class: 'quiet small', onclick: () => edit(t) }, 'Edit'), h('button', { class: 'danger small', onclick: () => retire(t) }, 'Retire'))),
        h('p', { class: 'muted' }, `Version ${t.version}, ${t.stage ? `used at ${t.stage}` : 'any stage'}, written by ${t.created_by_name}`),
        h('ol', { class: 'plain-steps' }, t.steps.map(step => h('li', {}, step.title, rangeText(step) ? h('span', { class: 'muted' }, ` (${rangeText(step)})`) : null)))))
      : h('p', { class: 'empty' }, 'No checklists yet. Write one for mash-in, knock-out, transfer or packaging so every brew day follows the same steps.'));
}

// ---- Sign in ---------------------------------------------------------------
function signInView() {
  let creating = false;
  const holder = h('div', { class: 'gate-form' });
  const draw = () => {
    holder.replaceChildren(
      h('h2', {}, creating ? 'Create your account' : 'Sign in'),
      buildForm({
        submit: creating ? 'Create account' : 'Sign in',
        fields: [
          creating && { name: 'name', label: 'Your name', required: true, autocomplete: 'name' },
          { name: 'email', label: 'Email', type: 'email', required: true, autocomplete: 'email' },
          { name: 'password', label: 'Password', type: 'password', required: true, hint: creating ? 'at least 8 characters' : null, autocomplete: creating ? 'new-password' : 'current-password' },
          creating && { name: 'registration_code', label: 'Registration code', hint: 'if your brewery uses one' }
        ].filter(Boolean),
        onSubmit: async values => {
          const result = await api('POST', creating ? '/auth/register' : '/auth/login', values);
          store.save(result.token, result.user);
          location.hash = '#/today';
          render();
        }
      }),
      h('p', { class: 'swap' }, creating ? 'Already have an account? ' : 'New here? ',
        h('button', { type: 'button', onclick: () => { creating = !creating; draw(); } }, creating ? 'Sign in' : 'Create an account'))
    );
  };
  draw();
  return h('div', { class: 'gate' },
    h('div', { class: 'gate-side' },
      h('div', {},
        h('img', { class: 'brand-mark gate-mark', src: '/brand/mark.svg', alt: '', width: 72, height: 72 }),
        h('h1', {}, 'Brick West', h('br'), 'Brewmaster')),
      h('p', {}, quip('tagline'))),
    holder);
}

// ---- Today -----------------------------------------------------------------
async function todayView() {
  const [today, tasks, vessels, batches, openRuns] = await Promise.all([
    api('GET', '/team/today'), api('GET', '/team/tasks'), api('GET', '/team/vessels'), api('GET', '/batches?limit=200'),
    api('GET', '/checklists/open')
  ]);
  const activeBatches = batches.filter(b => !['complete', 'discarded'].includes(b.status));
  const activeCount = today.batches.reduce((sum, row) => sum + Number(row.count), 0);
  const openTasks = tasks.filter(t => ['open', 'in_progress'].includes(t.status));
  const batchOptions = [{ value: '', label: 'Not linked to a batch' }, ...activeBatches.map(b => ({ value: b.id, label: b.batch_number }))];

  const addTank = () => openDialog('Add a tank', {
    submit: 'Add tank',
    fields: [
      { name: 'name', label: 'Tank name', required: true, placeholder: 'FV-1' },
      { name: 'capacity_liters', label: 'Capacity', type: 'number', hint: 'litres', min: 0 }
    ],
    onSubmit: async values => { await api('POST', '/team/vessels', values); toast('Tank added'); render(); }
  });

  const assign = vessel => {
    if (!activeBatches.length) return toast('Start a batch first, then assign it to a tank.');
    openDialog(`Fill ${vessel.name}`, {
      submit: 'Assign batch',
      fields: [{ name: 'batch_id', label: 'Batch', type: 'select', numeric: true, required: true, options: activeBatches.map(b => ({ value: b.id, label: `${b.batch_number} (${b.status})` })) }],
      onSubmit: async values => { await api('POST', `/team/vessels/${vessel.id}/assign`, values); toast(`${vessel.name} assigned`); render(); }
    });
  };

  const release = async vessel => {
    try { await api('POST', `/team/vessels/${vessel.id}/release`); toast(`${vessel.name} is empty. Time to break out the caustic.`); render(); }
    catch (err) { toast(err.message); }
  };

  const setTask = async (task, status) => {
    try { await api('PATCH', `/team/tasks/${task.id}/status`, { status }); toast(status === 'done' ? quip('done') : 'Task updated'); render(); }
    catch (err) { toast(err.message); }
  };

  const addTask = () => openDialog('Add a task', {
    submit: 'Add task',
    fields: [
      { name: 'title', label: 'What needs doing', required: true, wide: true, placeholder: 'Dry hop FV-2' },
      { name: 'due_at', label: 'Due', type: 'datetime-local' },
      { name: 'batch_id', label: 'Batch', type: 'select', numeric: true, options: batchOptions }
    ],
    onSubmit: async values => {
      if (values.due_at) values.due_at = new Date(values.due_at).toISOString();
      await api('POST', '/team/tasks', values); toast(taskToast(values.title)); render();
    }
  });

  return h('div', {},
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Today'), h('p', {}, new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })),
        h('p', { class: 'quip' }, greeting()))),
    h('div', { class: 'figures' },
      h('div', { class: 'figure' }, h('b', {}, activeCount), h('span', {}, activeCount === 1 ? 'batch in progress' : 'batches in progress')),
      h('div', { class: 'figure' }, h('b', {}, today.tasks.due_today), h('span', {}, today.tasks.due_today === 1 ? 'task due today' : 'tasks due today')),
      h('div', { class: `figure ${today.tasks.overdue ? 'alert' : ''}` }, h('b', {}, today.tasks.overdue), h('span', {}, today.tasks.overdue === 1 ? 'task overdue' : 'tasks overdue'))),

    h('section', { class: 'section' },
      h('div', { class: 'section-head' },
        h('h2', {}, `Tanks, ${today.vessels.occupied} of ${today.vessels.total} in use`),
        h('button', { class: 'quiet small', onclick: addTank }, 'Add tank')),
      vessels.length
        ? h('div', { class: 'tanks' }, vessels.map(v => h('div', { class: `tank ${v.batch_id ? 'full' : ''}` },
          h('div', { class: 'tank-shape', 'aria-hidden': 'true' }, h('span', {}, v.batch_number || 'Empty')),
          h('h3', {}, v.name),
          h('p', {}, v.batch_id ? `Holding ${v.batch_number}` : 'Empty', v.capacity_liters != null ? `, ${fmtNumber(v.capacity_liters)} L` : ''),
          v.batch_id
            ? h('button', { class: 'quiet small', onclick: () => release(v) }, 'Empty tank')
            : h('button', { class: 'small', onclick: () => assign(v) }, 'Assign batch'))))
        : h('p', { class: 'empty' }, `No tanks yet. Add your fermenters and brite tanks to see what is in each one. ${quip('emptyTanks')}`)),

    h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Open tasks'), h('button', { class: 'quiet small', onclick: addTask }, 'Add task')),
      openTasks.length
        ? h('ul', { class: 'tasks' }, openTasks.map(task => {
          const late = task.due_at && new Date(task.due_at) < new Date();
          return h('li', { class: late ? 'late' : '' },
            h('div', { class: 'what' }, h('b', {}, task.title),
              h('span', { class: 'when' }, task.due_at ? `${late ? 'Overdue, was due' : 'Due'} ${fmtDateTime(task.due_at)}` : 'No due date')),
            task.status === 'open' ? h('button', { class: 'quiet small', onclick: () => setTask(task, 'in_progress') }, 'Start') : statusTag('in_progress'),
            h('button', { class: 'small', onclick: () => setTask(task, 'done') }, 'Done'));
        }))
        : h('p', { class: 'empty' }, `${quip('emptyTasks')} Or add a task to remind the team about dry hops, transfers or cleaning.`)),

    openRuns.length
      ? h('section', { class: 'section' },
        h('div', { class: 'section-head' }, h('h2', {}, 'Checklists to finish')),
        h('ul', { class: 'tasks' }, openRuns.map(run => h('li', { class: run.exceptions ? 'late' : '' },
          h('div', { class: 'what' }, h('b', {}, `${run.name} on ${run.batch_number}`),
            h('span', { class: 'when' }, `${run.remaining_steps} of ${run.total_steps} steps left`, run.next_step ? `, next: ${run.next_step}` : '', run.exceptions ? `, ${run.exceptions} flagged` : '')),
          h('a', { class: 'button-link', href: `#/batches/${run.batch_id}` }, 'Open')))))
      : null);
}

// ---- Batches ---------------------------------------------------------------
async function batchesView(params) {
  const filter = params.get('status') || '';
  const [batches, recipes] = await Promise.all([
    api('GET', `/batches?limit=200${filter ? `&status=${encodeURIComponent(filter)}` : ''}`), api('GET', '/recipes?limit=200')
  ]);
  const recipeName = id => recipes.find(r => r.id === id)?.name || '—';

  const newBatch = () => openDialog('Start a batch', {
    submit: 'Start batch',
    fields: [
      { name: 'batch_number', label: 'Batch number', required: true, placeholder: 'BW-2026-041' },
      { name: 'recipe_id', label: 'Recipe', type: 'select', numeric: true, options: [{ value: '', label: 'No recipe' }, ...recipes.map(r => ({ value: r.id, label: r.name }))] },
      { name: 'brew_date', label: 'Brew date', type: 'date', value: new Date().toLocaleDateString('en-CA') },
      { name: 'volume_produced', label: 'Volume', type: 'number', hint: 'litres', min: 0 },
      { name: 'notes', label: 'Notes', type: 'textarea', wide: true }
    ],
    onSubmit: async values => {
      const batch = await api('POST', '/batches', values);
      toast(`Batch ${batch.batch_number} started`);
      location.hash = `#/batches/${batch.id}`;
    }
  });

  const filterSelect = h('select', {
    'aria-label': 'Show batches with status',
    onchange: event => { location.hash = event.target.value ? `#/batches?status=${event.target.value}` : '#/batches'; }
  }, [['', 'All batches'], ...[...STATUSES, 'discarded'].map(s => [s, label(s)])].map(([value, text]) => h('option', { value, selected: value === filter }, text)));

  return h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Batches'),
      h('div', { class: 'actions' }, h('label', {}, filterSelect), h('button', { onclick: newBatch }, 'Start a batch'))),
    table(['Batch', 'Recipe', 'Status', 'Brewed', { label: 'Volume (L)', num: true }],
      batches.map(b => h('tr', {},
        cell(h('a', { href: `#/batches/${b.id}` }, b.batch_number)), cell(recipeName(b.recipe_id)), cell(statusTag(b.status)),
        cell(fmtDate(b.brew_date)), cell(fmtNumber(b.volume_produced), true))),
      filter ? `No batches are ${label(filter).toLowerCase()} right now.` : 'No batches yet. Start one to begin logging readings.'));
}

function chart(title, unit, points) {
  const values = points.map(p => p.value);
  const latest = values[values.length - 1];
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const W = 320, H = 120, pad = 10;
  const x = i => (points.length === 1 ? W / 2 : pad + (i * (W - pad * 2)) / (points.length - 1));
  const y = v => H - pad - ((v - min) / span) * (H - pad * 2);
  return h('div', { class: 'panel chart' },
    h('p', { class: 'muted' }, title),
    h('p', { class: 'latest' }, `${fmtNumber(latest)} ${unit}`),
    h('svg', { viewBox: `0 0 ${W} ${H + 18}`, role: 'img', 'aria-label': `${title}: ${points.length} readings from ${fmtNumber(values[0])} to ${fmtNumber(latest)} ${unit}` },
      h('line', { class: 'axis', x1: 0, x2: W, y1: H, y2: H }),
      points.length > 1 ? h('polyline', { class: 'line', points: points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ') }) : null,
      points.map((p, i) => h('circle', { class: 'dot', cx: x(i), cy: y(p.value), r: 3.5 })),
      h('text', { x: 0, y: H + 15 }, `low ${fmtNumber(min)}`),
      h('text', { x: W, y: H + 15, 'text-anchor': 'end' }, `high ${fmtNumber(max)}`)));
}

async function batchView(id) {
  const [batch, logs, usage, runs, templates] = await Promise.all([
    api('GET', `/batches/${id}`), api('GET', `/batches/${id}/logs`), api('GET', `/inventory/batches/${id}/usage`).catch(() => null),
    api('GET', `/checklists/batches/${id}`), api('GET', '/checklists/templates')
  ]);
  const unused = templates.filter(t => !runs.some(r => r.template_id === t.id));
  const startChecklist = () => {
    if (!templates.length) return toast('Write a checklist first, on the Checklists page.');
    if (!unused.length) return toast('Every checklist has already been started for this batch.');
    // Offer the ones written for the stage this batch is at first.
    const ordered = [...unused].sort((a, b) => (b.stage === batch.status) - (a.stage === batch.status));
    openDialog('Start a checklist', {
      submit: 'Start checklist',
      fields: [{ name: 'template_id', label: 'Checklist', type: 'select', numeric: true, required: true,
        options: ordered.map(t => ({ value: t.id, label: `${t.name}${t.stage ? ` (${t.stage})` : ''}` })) }],
      onSubmit: async values => { await api('POST', `/checklists/batches/${id}`, values); toast('Checklist started'); render(); }
    });
  };
  const index = STATUSES.indexOf(batch.status);
  const next = index >= 0 && index < STATUSES.length - 1 ? STATUSES[index + 1] : null;
  const closed = ['complete', 'discarded'].includes(batch.status);

  const move = async status => {
    try { await api('PUT', `/batches/${id}/status`, { status }); toast(`Batch is now ${label(status).toLowerCase()}`); render(); }
    catch (err) { toast(err.message); }
  };

  const readingForm = buildForm({
    submit: 'Log reading',
    fields: [
      { name: 'temperature', label: 'Temperature', type: 'number', hint: '°C', required: true },
      { name: 'gravity', label: 'Gravity', type: 'number', hint: 'SG, e.g. 1.048', required: true, min: 0 },
      { name: 'ph', label: 'pH', type: 'number', hint: 'optional', min: 0 },
      { name: 'notes', label: 'Notes', wide: true, placeholder: 'Krausen forming, sample tastes clean' }
    ],
    onSubmit: async values => { await api('POST', `/batches/${id}/logs`, { ...values, phase: batch.status }); toast('Reading logged'); render(); }
  });

  const usageLines = usage?.lines || [];

  return h('div', {},
    h('a', { class: 'back', href: '#/batches' }, 'All batches'),
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, batch.batch_number),
        h('p', {}, `Brewed ${fmtDate(batch.brew_date)}`, batch.volume_produced ? `, ${fmtNumber(batch.volume_produced)} L` : '', usage?.batch?.recipe_name ? `, ${usage.batch.recipe_name}` : '')),
      h('div', { class: 'actions' },
        batch.status === 'discarded' ? statusTag('discarded') : null,
        next ? h('button', { onclick: () => move(next) }, `Move to ${next}`) : null,
        !closed ? h('button', { class: 'danger', onclick: () => { if (confirm(`Discard batch ${batch.batch_number}? It will be marked as dumped.`)) move('discarded'); } }, 'Discard batch') : null)),
    batch.status !== 'discarded'
      ? h('ol', { class: 'steps', 'aria-label': 'Brewing stage' }, STATUSES.map((s, i) => h('li', { class: i < index ? 'done' : i === index ? 'now' : '', 'aria-current': i === index ? 'step' : undefined }, label(s))))
      : null,
    batch.notes ? h('p', { class: 'panel' }, batch.notes) : null,

    h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Checklists'),
        !closed ? h('button', { class: 'quiet small', onclick: startChecklist }, 'Start a checklist') : null),
      runs.length ? runs.map(checklistRun) : h('p', { class: 'empty' }, 'No checklist started for this batch.')),

    h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Readings')),
      logs.length
        ? h('div', { class: 'charts' },
          chart('Gravity', 'SG', logs.map(l => ({ value: Number(l.gravity) }))),
          chart('Temperature', '°C', logs.map(l => ({ value: Number(l.temperature) }))))
        : null,
      !closed ? h('div', { class: 'panel' }, readingForm) : null,
      h('div', { class: 'section' }, table(['When', 'Stage', { label: 'Temp (°C)', num: true }, { label: 'Gravity', num: true }, { label: 'pH', num: true }, 'Notes'],
        [...logs].reverse().map(l => h('tr', {}, cell(fmtDateTime(l.measured_at)), cell(label(l.phase || '—')), cell(fmtNumber(l.temperature), true),
          cell(fmtNumber(l.gravity), true), cell(fmtNumber(l.ph), true), cell(l.notes || ''))),
        'No readings yet. Log the first temperature and gravity above.'))),

    usageLines.length
      ? h('section', { class: 'section' },
        h('div', { class: 'section-head' }, h('h2', {}, 'Ingredients, planned against used')),
        table(['Ingredient', { label: 'Planned', num: true }, { label: 'Used', num: true }, { label: 'Difference', num: true }],
          usageLines.map(line => h('tr', {}, cell(line.name || line.sku), cell(line.planned == null ? '—' : `${line.planned} ${line.unit || ''}`, true),
            cell(`${line.actual} ${line.unit || ''}`, true), cell(line.variance == null ? '—' : (line.variance > 0 ? '+' : '') + line.variance, true))), ''))
      : null);
}

// ---- Recipes ---------------------------------------------------------------
// "5 kg Citra" -> { amount: 5, unit: 'kg', name: 'Citra' }
function parseIngredients(text) {
  return text.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const match = line.match(/^([\d.]+)\s*([^\s\d]+)\s+(.+)$/);
    return match ? { amount: Number(match[1]), unit: match[2], name: match[3].trim() } : { name: line };
  });
}

async function recipesView() {
  const recipes = await api('GET', '/recipes?limit=200');

  const newRecipe = () => openDialog('Add a recipe', {
    submit: 'Save recipe',
    fields: [
      { name: 'name', label: 'Name', required: true, wide: true, placeholder: 'West Coast IPA' },
      { name: 'style', label: 'Style', placeholder: 'IPA' },
      { name: 'volume_liters', label: 'Batch size', type: 'number', hint: 'litres', min: 0 },
      { name: 'target_abv', label: 'Target ABV', type: 'number', hint: '%', min: 0 },
      { name: 'target_ibu', label: 'Target IBU', type: 'number', min: 0 },
      { name: 'ingredients', label: 'Ingredients', type: 'textarea', wide: true, hint: 'one per line: amount, unit, name', placeholder: '180 kg Pale malt\n5 kg Citra' },
      { name: 'notes', label: 'Notes', type: 'textarea', wide: true }
    ],
    onSubmit: async values => {
      if (values.ingredients) values.ingredients = parseIngredients(values.ingredients);
      await api('POST', '/recipes', values); toast('Recipe saved'); render();
    }
  });

  const remove = async recipe => {
    if (!confirm(`Delete the recipe "${recipe.name}"? Batches already brewed from it are kept.`)) return;
    try { await api('DELETE', `/recipes/${recipe.id}`); toast('Recipe deleted'); render(); } catch (err) { toast(err.message); }
  };

  return h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Recipes'), h('button', { onclick: newRecipe }, 'Add a recipe')),
    table(['Recipe', 'Style', { label: 'ABV %', num: true }, { label: 'IBU', num: true }, { label: 'Batch (L)', num: true }, 'Ingredients', ''],
      recipes.map(r => h('tr', {},
        cell(h('b', {}, r.name)), cell(r.style || '—'), cell(fmtNumber(r.target_abv), true), cell(fmtNumber(r.target_ibu), true), cell(fmtNumber(r.volume_liters), true),
        cell(Array.isArray(r.ingredients) && r.ingredients.length
          ? r.ingredients.map(i => [i.amount, i.unit, i.name].filter(v => v != null).join(' ')).join(', ') : '—'),
        cell(h('button', { class: 'danger small', onclick: () => remove(r) }, 'Delete')))),
      'No recipes yet. Add one so batches can be compared against it.'));
}

// ---- Inventory -------------------------------------------------------------
async function inventoryView() {
  const [items, suppliers, batches] = await Promise.all([api('GET', '/inventory/items'), api('GET', '/inventory/suppliers'), api('GET', '/batches?limit=200')]);
  const activeBatches = batches.filter(b => !['complete', 'discarded'].includes(b.status));
  const open = new Set(JSON.parse(sessionStorage.getItem('bw.openItems') || '[]'));
  const lots = Object.fromEntries(await Promise.all([...open].filter(id => items.some(i => i.id === id)).map(async id => [id, await api('GET', `/inventory/items/${id}/lots`)])));

  const toggle = id => {
    open.has(id) ? open.delete(id) : open.add(id);
    sessionStorage.setItem('bw.openItems', JSON.stringify([...open]));
    render();
  };

  const addItem = () => openDialog('Add a stock item', {
    submit: 'Add item',
    fields: [
      { name: 'name', label: 'Name', required: true, placeholder: 'Citra hops' },
      { name: 'sku', label: 'SKU', required: true, placeholder: 'HOP-CITRA' },
      { name: 'category', label: 'Type', type: 'select', required: true, options: [{ value: 'ingredient', label: 'Ingredient' }, { value: 'packaging', label: 'Packaging' }] },
      { name: 'unit', label: 'Unit', required: true, placeholder: 'kg' },
      { name: 'reorder_point', label: 'Reorder when at or below', type: 'number', min: 0 }
    ],
    onSubmit: async values => { await api('POST', '/inventory/items', values); toast('Item added'); render(); }
  });

  const addSupplier = () => openDialog('Add a supplier', {
    submit: 'Add supplier',
    fields: [{ name: 'name', label: 'Supplier name', required: true }, { name: 'contact', label: 'Contact', hint: 'phone or email' }],
    onSubmit: async values => { await api('POST', '/inventory/suppliers', values); toast('Supplier added'); render(); }
  });

  const receive = item => {
    if (!items.length) return toast('Add a stock item first.');
    openDialog('Receive stock', {
      submit: 'Receive stock',
      fields: [
        { name: 'item_id', label: 'Item', type: 'select', numeric: true, required: true, value: item?.id, options: items.map(i => ({ value: i.id, label: `${i.name} (${i.unit})` })) },
        { name: 'quantity', label: 'Quantity', type: 'number', required: true, min: 0 },
        { name: 'lot_number', label: 'Lot number', required: true, hint: 'from the supplier label' },
        { name: 'supplier_id', label: 'Supplier', type: 'select', numeric: true, options: [{ value: '', label: 'Not recorded' }, ...suppliers.map(s => ({ value: s.id, label: s.name }))] },
        { name: 'expires_on', label: 'Best before', type: 'date' }
      ],
      onSubmit: async values => {
        await api('POST', '/inventory/receive', values);
        open.add(values.item_id); sessionStorage.setItem('bw.openItems', JSON.stringify([...open]));
        toast('Stock received'); render();
      }
    });
  };

  const useLot = (item, lot) => {
    if (!activeBatches.length) return toast('Start a batch first, then record what went into it.');
    openDialog(`Use ${item.name}, lot ${lot.lot_number}`, {
      intro: `${fmtNumber(lot.on_hand)} ${item.unit} on hand in this lot.`,
      submit: 'Record use',
      fields: [
        { name: 'batch_id', label: 'Batch', type: 'select', numeric: true, required: true, options: activeBatches.map(b => ({ value: b.id, label: b.batch_number })) },
        { name: 'quantity', label: `Quantity (${item.unit})`, type: 'number', required: true, min: 0 }
      ],
      onSubmit: async values => { await api('POST', '/inventory/movements', { ...values, type: 'consume', lot_id: lot.id }); toast('Use recorded'); render(); }
    });
  };

  const writeOff = (item, lot) => openDialog(`Write off ${item.name}, lot ${lot.lot_number}`, {
    intro: 'For spoiled, spilled or expired stock.',
    submit: 'Write off',
    fields: [
      { name: 'quantity', label: `Quantity (${item.unit})`, type: 'number', required: true, min: 0 },
      { name: 'reason', label: 'Reason', required: true, wide: true }
    ],
    onSubmit: async values => { await api('POST', '/inventory/movements', { ...values, type: 'waste', lot_id: lot.id }); toast('Written off'); render(); }
  });

  const rows = items.flatMap(item => {
    const isOpen = open.has(item.id);
    const main = h('tr', {},
      cell(h('button', { class: 'quiet small', 'aria-expanded': String(isOpen), onclick: () => toggle(item.id) }, isOpen ? 'Hide lots' : 'Show lots')),
      cell([h('b', {}, item.name), h('div', { class: 'muted' }, item.sku)]), cell(label(item.category)),
      cell(`${fmtNumber(item.on_hand)} ${item.unit}`, true),
      cell(item.below_reorder ? statusTag('Reorder', 'low') : item.reorder_point != null ? h('span', { class: 'muted' }, `Reorder at ${fmtNumber(item.reorder_point)}`) : ''),
      cell(h('button', { class: 'small', onclick: () => receive(item) }, 'Receive')));
    if (!isOpen) return [main];
    const itemLots = lots[item.id] || [];
    const sub = itemLots.length
      ? itemLots.map(lot => h('tr', { class: 'sub' },
        cell(''), cell([`Lot ${lot.lot_number}`, h('div', { class: 'muted' }, lot.supplier_name || 'Supplier not recorded')]),
        cell(lot.expires_on ? `Best before ${fmtDate(lot.expires_on)}` : ''), cell(`${fmtNumber(lot.on_hand)} ${item.unit}`, true), cell(''),
        cell(lot.on_hand > 0 ? h('div', { class: 'actions' },
          h('button', { class: 'quiet small', onclick: () => useLot(item, lot) }, 'Use in batch'),
          h('button', { class: 'danger small', onclick: () => writeOff(item, lot) }, 'Write off')) : h('span', { class: 'muted' }, 'Used up'))))
      : [h('tr', { class: 'sub' }, h('td', { colSpan: 6 }, 'No lots received yet.'))];
    return [main, ...sub];
  });

  return h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Inventory'),
      h('div', { class: 'actions' },
        h('button', { class: 'quiet', onclick: addSupplier }, 'Add supplier'),
        h('button', { class: 'quiet', onclick: addItem }, 'Add item'),
        h('button', { onclick: () => receive() }, 'Receive stock'))),
    table(['', 'Item', 'Type', { label: 'On hand', num: true }, '', ''], rows,
      'No stock items yet. Add your malts, hops, yeast and packaging, then receive deliveries against them.'));
}

// ---- Router and shell ------------------------------------------------------
const NAV = [['today', 'Today'], ['batches', 'Batches'], ['checklists', 'Checklists'], ['recipes', 'Recipes'], ['inventory', 'Inventory'], ['scan', 'Scan']];
let renderCount = 0;

async function render() {
  stopScanning();
  if (!store.token) { app.replaceChildren(signInView()); return; }
  const [path, query = ''] = (location.hash.slice(2) || 'today').split('?');
  const [section, id] = path.split('/');
  const params = new URLSearchParams(query);
  const main = h('main', { class: 'main', id: 'main' });
  const signOut = () => { store.clear(); location.hash = ''; render(); };

  const shell = h('div', { class: 'shell' },
    h('aside', { class: 'rail' },
      h('div', { class: 'brand' },
        h('img', { class: 'brand-mark', src: '/brand/mark.svg', alt: '', width: 40, height: 40, title: 'Brick West Brewing Co.' }),
        h('span', {}, 'Brick West', h('small', {}, 'Brewmaster'))),
      h('nav', { class: 'nav', 'aria-label': 'Sections' }, NAV.map(([key, text]) => h('a', { href: `#/${key}`, 'aria-current': key === section ? 'page' : undefined }, text))),
      h('div', { class: 'who' }, store.user?.name || store.user?.email || '', h('br'), h('button', { class: 'quiet small', onclick: signOut }, 'Sign out'))),
    main);

  // Keep the page that is already showing until the new one has loaded.
  const current = ++renderCount;
  if (!app.querySelector('.shell')) { main.append(h('p', { class: 'muted' }, quip('loading'))); app.replaceChildren(shell); }
  let content;
  try {
    if (outbox.read().length) await outbox.flush();
    if (section === 'batches' && id) content = await batchView(id);
    else if (section === 'batches') content = await batchesView(params);
    else if (section === 'checklists') content = await checklistsView();
    else if (section === 'recipes') content = await recipesView();
    else if (section === 'inventory') content = await inventoryView();
    else if (section === 'scan') content = await scanView({ api, h, openDialog, toast });
    else content = await todayView();
  } catch (err) {
    if (!store.token) return;
    content = h('div', {}, h('h1', {}, quip('error')),
      h('p', { class: 'empty' }, err instanceof ApiError ? err.message : 'Something went wrong while loading.'),
      h('button', { onclick: render }, 'Try again'));
    if (!(err instanceof ApiError)) console.error(err);
  }
  if (current !== renderCount) return;
  main.replaceChildren(content,
    h('p', { class: 'mobile-only section' }, h('button', { class: 'quiet small', onclick: signOut }, `Sign out ${store.user?.name || ''}`)));
  app.replaceChildren(shell);
}

window.addEventListener('hashchange', render);
// Back in range: send anything recorded while offline, then refresh.
window.addEventListener('online', async () => {
  if (!store.token || !outbox.read().length) return;
  const sent = await outbox.flush();
  if (sent) { toast(sent === 1 ? 'Sent 1 saved checklist step' : `Sent ${sent} saved checklist steps`); render(); }
});
installEasterEggs({ toast });
render();
