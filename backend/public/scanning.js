let controls, video, nfc;
let generation = 0;
export function stopScanning() {
  generation++;
  controls?.stop(); controls = null;
  video?.srcObject?.getTracks().forEach(t => t.stop());
  if (video) { video.srcObject = null; video.hidden = true; }
  nfc?.abort(); nfc = null;
}
document.addEventListener('visibilitychange', () => { if (document.hidden) stopScanning(); });
window.addEventListener('pagehide', stopScanning);

export async function scanView({ api, h, openDialog, toast }) {
  const [labels, areas, targets] = await Promise.all([api('GET', '/scan/labels'), api('GET', '/scan/areas'), api('GET', '/scan/targets')]);
  let lastCode = '';
  const result = h('section', { class: 'section', 'aria-live': 'polite' });
  const input = h('input', { id: 'scan-code', placeholder: 'Scan or enter a label code', maxlength: 256, autocomplete: 'off' });
  const status = h('p', { class: 'muted', role: 'status' });
  const cameraVideo = h('video', { class: 'scan-video', playsInline: true, muted: true, hidden: true });
  video = cameraVideo;
  const refresh = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
  const lookup = async raw => {
    stopScanning(); lastCode = String(raw).trim(); input.value = lastCode;
    status.textContent = 'Looking up inventory…'; result.replaceChildren();
    const current = generation;
    try {
      const data = await api('POST', '/scan/resolve', { code: lastCode });
      if (current !== generation) return;
      const { kind, target, lots, batch, reminders } = data;
      result.replaceChildren(h('div', {}, h('h2', {}, target.name || target.lot_number),
        kind === 'item' ? h('p', {}, `On hand: ${data.on_hand} ${target.unit}`) : null,
        kind === 'vessel' ? h('p', {}, batch ? `Batch ${batch.batch_number} · ${batch.status} · ${batch.volume_produced ?? 'Unrecorded'} liters produced` : 'No active batch assigned') : null,
        kind === 'vessel' ? h('p', { class: 'muted' }, 'Tank contents reflect the batch assignment, not a live level measurement.') : null,
        ...reminders.map(r => h('p', { class: 'form-error' }, r.message)),
        ...lots.map(lot => h('article', { class: 'card' }, h('h3', {}, lot.item_name),
          h('p', {}, `Lot ${lot.lot_number} · ${lot.on_hand} ${lot.unit}`),
          h('p', { class: 'muted' }, `Area: ${lot.area_name || 'Unassigned'} · Expiry: ${lot.expires_on ? new Date(lot.expires_on).toLocaleDateString() : 'Not set'}`),
          h('button', { class: 'quiet small', onclick: () => openDialog('Set storage area', {
            fields: [{ name: 'area_id', label: 'Area', type: 'select', options: [{ value: '', label: 'Unassigned' }, ...areas.map(a => ({ value: a.id, label: a.name }))], value: lot.area_id }],
            submit: 'Save area', onSubmit: async values => {
              await api('PATCH', `/scan/lots/${lot.id}/area`, { area_id: values.area_id ? Number(values.area_id) : null }); await lookup(lastCode);
            }
          }) }, 'Set area'))),
        kind !== 'vessel' && !lots.length ? h('p', { class: 'empty' }, 'No stock lots found.') : null,
        h('a', { href: '#/inventory' }, 'Open inventory to receive or use stock')));
      status.textContent = 'Inventory shown. No stock or tasks changed.';
    } catch (error) { if (current === generation) status.textContent = `${error.message}. Register an unlinked code below.`; }
  };
  const startCamera = async () => {
    stopScanning(); const current = generation;
    if (!window.isSecureContext) { status.textContent = 'Camera scanning needs HTTPS or localhost.'; return; }
    status.textContent = 'Point the camera at a QR code or barcode.'; cameraVideo.hidden = false;
    try {
      const reader = new window.ZXingBrowser.BrowserMultiFormatReader();
      const session = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, cameraVideo,
        (code, _error, session) => { if (code && current === generation) { session.stop(); lookup(code.getText()); } });
      if (current !== generation) { session.stop(); return; } controls = session;
    } catch { if (current === generation) { stopScanning(); status.textContent = 'Camera unavailable. Allow camera access or enter the code below.'; } }
  };
  const readNfc = async () => {
    stopScanning();
    if (!('NDEFReader' in window)) { status.textContent = 'This browser does not support NFC. Use the phone app for NFC, or scan the QR label here.'; return; }
    const current = generation; nfc = new AbortController();
    try {
      const reader = new window.NDEFReader();
      reader.onreading = event => {
        if (current !== generation) return;
        const record = event.message.records.find(r => r.recordType === 'text');
        if (!record) { status.textContent = 'No label text found. Write a label code to this tag first.'; return; }
        try { lookup(new TextDecoder(record.encoding || 'utf-8').decode(record.data)); }
        catch { status.textContent = 'This tag could not be read. Try its QR label.'; }
      };
      reader.onreadingerror = () => { status.textContent = 'Unable to read tag. Hold the phone near the tag again.'; };
      await reader.scan({ signal: nfc.signal });
      if (current === generation) status.textContent = 'Hold your phone near the NFC tag.';
    } catch { if (current === generation) { stopScanning(); status.textContent = 'NFC unavailable or cancelled. Check NFC settings or use a QR label.'; } }
  };
  const register = () => {
    stopScanning();
    if (!targets.length) return toast('Add an inventory item, tank, or area first.');
    openDialog('Register a label', {
      intro: 'Leave the code blank to generate a QR/NFC label, or enter an existing barcode exactly as printed.',
      fields: [{ name: 'target', label: 'Link to', type: 'select', required: true, options: targets.map(t => ({ value: `${t.kind}:${t.id}`, label: `${t.kind === 'vessel' ? 'Tank' : t.kind}: ${t.name}` })) },
        { name: 'code', label: 'Existing barcode or label code (optional)', value: lastCode }],
      submit: 'Register label', onSubmit: async values => {
        const [kind, id] = values.target.split(':');
        await api('POST', '/scan/labels', { kind, target_id: Number(id), ...(values.code ? { code: values.code } : {}) });
        toast('Label registered'); refresh();
      }
    });
  };
  const printLabel = async label => {
    stopScanning();
    try {
      const { image } = await api('GET', `/scan/labels/${label.id}/qr-image`);
      const dialog = h('dialog', { class: 'label-print', 'aria-label': 'Print QR label' });
      const close = () => { dialog.close(); dialog.remove(); };
      dialog.append(h('h2', {}, label.target_name), h('img', { src: image, alt: `QR label for ${label.target_name}`, width: 240, height: 240 }),
        h('p', {}, label.code), h('button', { onclick: () => window.print() }, 'Print'), h('button', { class: 'quiet', onclick: close }, 'Close'));
      dialog.addEventListener('cancel', () => dialog.remove()); document.body.append(dialog); dialog.showModal();
    } catch (error) { toast(error.message); }
  };
  const writeNfc = async label => {
    stopScanning();
    if (!('NDEFReader' in window)) return toast('Use the phone app to write NFC tags on this device.');
    if (!confirm(`Write the label for ${label.target_name} to an NFC tag? This replaces the tag’s existing contents.`)) return;
    nfc = new AbortController();
    const current = generation;
    try {
      status.textContent = 'Hold a writable NFC tag near your phone.';
      await new window.NDEFReader().write({ records: [{ recordType: 'text', data: label.code }] }, { signal: nfc.signal });
      if (current === generation) status.textContent = 'NFC label written.';
    } catch { if (current === generation) status.textContent = 'Tag write cancelled or failed. Check that the tag is writable.'; }
    finally { if (current === generation) stopScanning(); }
  };
  return h('div', {}, h('h1', {}, 'Scan inventory'), h('p', { class: 'muted' }, 'Identify stock, a tank, or a storage area with a QR code, barcode, or NFC tag.'),
    h('div', { class: 'actions' }, h('button', { onclick: startCamera }, 'Scan QR / barcode'), h('button', { onclick: readNfc }, 'Read NFC tag'),
      h('button', { class: 'quiet', onclick: () => { stopScanning(); status.textContent = 'Scanner stopped.'; } }, 'Stop')),
    cameraVideo, h('form', { onsubmit: event => { event.preventDefault(); lookup(input.value); } },
      h('label', { for: 'scan-code' }, 'Label code', input), h('button', { type: 'submit' }, 'Look up')), status, result,
    h('section', { class: 'section' }, h('h2', {}, 'Labels and areas'), h('div', { class: 'actions' }, h('button', { onclick: register }, 'Register label'),
      h('button', { class: 'quiet', onclick: () => openDialog('Add storage area', { fields: [{ name: 'name', label: 'Name', required: true }], submit: 'Add area',
        onSubmit: async values => { await api('POST', '/scan/areas', values); refresh(); } }) }, 'Add area')),
      ...labels.map(label => h('article', { class: 'card' }, h('h3', {}, label.target_name), h('p', {}, label.code), h('div', { class: 'actions' },
        h('button', { class: 'quiet small', onclick: () => lookup(label.code) }, 'View inventory'),
        h('button', { class: 'quiet small', onclick: () => printLabel(label) }, 'QR label'),
        h('button', { class: 'quiet small', onclick: () => writeNfc(label) }, 'Write NFC'),
        h('button', { class: 'quiet small', onclick: async () => {
          if (!confirm(`Retire the label for ${label.target_name}? Its QR and NFC tags will stop resolving.`)) return;
          try { await api('DELETE', `/scan/labels/${label.id}`); toast('Label retired'); refresh(); } catch (error) { toast(error.message); }
        } }, 'Retire'))))));
}
