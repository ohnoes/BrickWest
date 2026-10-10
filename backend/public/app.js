// Brickwest Brewmaster web app. Plain modules, no build step. Every node is
// created with h() and text goes in as text, never as HTML, so nothing a
// brewer types can run as script (the page's Content-Security-Policy backs
// that up).

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
    throw new ApiError('Could not reach the server. Check your connection and try again.');
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
      h('h1', {}, 'Brickwest Brewmaster'),
      h('p', {}, 'Tanks, batches, readings and stock for the brewhouse floor.')),
    holder);
}

// ---- Today -----------------------------------------------------------------
async function todayView() {
  const [today, tasks, vessels, batches] = await Promise.all([
    api('GET', '/team/today'), api('GET', '/team/tasks'), api('GET', '/team/vessels'), api('GET', '/batches?limit=200')
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
    try { await api('POST', `/team/vessels/${vessel.id}/release`); toast(`${vessel.name} is empty`); render(); }
    catch (err) { toast(err.message); }
  };

  const setTask = async (task, status) => {
    try { await api('PATCH', `/team/tasks/${task.id}/status`, { status }); toast(status === 'done' ? 'Task done' : 'Task updated'); render(); }
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
      await api('POST', '/team/tasks', values); toast('Task added'); render();
    }
  });

  return h('div', {},
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Today'), h('p', {}, new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })))),
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
        : h('p', { class: 'empty' }, 'No tanks yet. Add your fermenters and brite tanks to see what is in each one.')),

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
        : h('p', { class: 'empty' }, 'Nothing open. Add a task to remind the team about dry hops, transfers or cleaning.')));
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
  const [batch, logs, usage] = await Promise.all([
    api('GET', `/batches/${id}`), api('GET', `/batches/${id}/logs`), api('GET', `/inventory/batches/${id}/usage`).catch(() => null)
  ]);
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
const NAV = [['today', 'Today'], ['batches', 'Batches'], ['recipes', 'Recipes'], ['inventory', 'Inventory']];
let renderCount = 0;

async function render() {
  if (!store.token) { app.replaceChildren(signInView()); return; }
  const [path, query = ''] = (location.hash.slice(2) || 'today').split('?');
  const [section, id] = path.split('/');
  const params = new URLSearchParams(query);
  const main = h('main', { class: 'main', id: 'main' });
  const signOut = () => { store.clear(); location.hash = ''; render(); };

  const shell = h('div', { class: 'shell' },
    h('aside', { class: 'rail' },
      h('div', { class: 'brand' }, 'Brickwest', h('small', {}, 'Brewmaster')),
      h('nav', { class: 'nav', 'aria-label': 'Sections' }, NAV.map(([key, text]) => h('a', { href: `#/${key}`, 'aria-current': key === section ? 'page' : undefined }, text))),
      h('div', { class: 'who' }, store.user?.name || store.user?.email || '', h('br'), h('button', { class: 'quiet small', onclick: signOut }, 'Sign out'))),
    main);

  // Keep the page that is already showing until the new one has loaded.
  const current = ++renderCount;
  if (!app.querySelector('.shell')) { main.append(h('p', { class: 'muted' }, 'Loading…')); app.replaceChildren(shell); }
  let content;
  try {
    if (section === 'batches' && id) content = await batchView(id);
    else if (section === 'batches') content = await batchesView(params);
    else if (section === 'recipes') content = await recipesView();
    else if (section === 'inventory') content = await inventoryView();
    else content = await todayView();
  } catch (err) {
    if (!store.token) return;
    content = h('div', {}, h('h1', {}, 'This page did not load'),
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
render();
