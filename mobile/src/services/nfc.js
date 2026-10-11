import NfcManager, { NfcTech, Ndef } from 'react-native-nfc-manager';

let busy = false;
let generation = 0;
let cancellation = Promise.resolve();
async function session(action) {
  if (busy) throw new Error('An NFC session is already running');
  busy = true;
  const current = generation;
  const checkCancelled = () => { if (current !== generation) throw new Error('NFC session cancelled'); };
  try {
    await cancellation;
    checkCancelled();
    if (!await NfcManager.isSupported()) throw new Error('This phone does not support NFC');
    checkCancelled();
    await NfcManager.start();
    checkCancelled();
    await NfcManager.requestTechnology(NfcTech.Ndef);
    checkCancelled();
    return await action();
  } finally {
    try { await NfcManager.cancelTechnologyRequest(); } catch { /* Session may already be closed. */ }
    busy = false;
  }
}
export async function readNfcLabel() {
  return session(async () => {
    const tag = await NfcManager.getTag();
    const record = tag?.ndefMessage?.find(r => Ndef.isType(r, Ndef.TNF_WELL_KNOWN, Ndef.RTD_TEXT));
    if (!record) throw new Error('No label text found. Write a label code to this tag first.');
    return Ndef.text.decodePayload(record.payload);
  });
}
export async function writeNfcLabel(code) {
  return session(async () => {
    const bytes = Ndef.encodeMessage([Ndef.textRecord(code)]);
    if (!bytes) throw new Error('Unable to encode label');
    await NfcManager.ndefHandler.writeNdefMessage(bytes);
  });
}
export async function cancelNfc() {
  generation++;
  cancellation = (async () => { try { await NfcManager.cancelTechnologyRequest(); } catch { /* Nothing to cancel. */ } })();
  await cancellation;
}
