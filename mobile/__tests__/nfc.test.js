jest.mock('react-native-nfc-manager', () => {
  const Ndef = jest.requireActual('react-native-nfc-manager/ndef-lib');
  return { __esModule: true, Ndef, NfcTech: { Ndef: 'Ndef' }, default: {
    isSupported: jest.fn(), start: jest.fn(), requestTechnology: jest.fn(), getTag: jest.fn(), cancelTechnologyRequest: jest.fn(),
    ndefHandler: { writeNdefMessage: jest.fn() }
  } };
});
import manager, { Ndef } from 'react-native-nfc-manager';
import { readNfcLabel, writeNfcLabel, cancelNfc } from '../src/services/nfc';

beforeEach(() => {
  jest.resetAllMocks();
  manager.isSupported.mockResolvedValue(true);
  manager.getTag.mockResolvedValue({ ndefMessage: [Ndef.textRecord('001234567890')] });
});
test('reads NDEF text without losing barcode leading zeros, then closes the session', async () => {
  expect(await readNfcLabel()).toBe('001234567890');
  expect(manager.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
});
test('writes a portable text label that can be decoded on either phone platform', async () => {
  await writeNfcLabel('bw:test-label');
  const bytes = manager.ndefHandler.writeNdefMessage.mock.calls[0][0];
  const [record] = Ndef.decodeMessage(bytes);
  expect(Ndef.text.decodePayload(record.payload)).toBe('bw:test-label');
});
test('unsupported devices and unreadable tags return useful errors and close sessions', async () => {
  manager.isSupported.mockResolvedValueOnce(false);
  await expect(readNfcLabel()).rejects.toThrow('does not support NFC');
  manager.getTag.mockResolvedValueOnce({ ndefMessage: [] });
  await expect(readNfcLabel()).rejects.toThrow('No label text');
  expect(manager.cancelTechnologyRequest).toHaveBeenCalledTimes(2);
});
test('a failed tag write closes the session and allows another scan', async () => {
  manager.ndefHandler.writeNdefMessage.mockRejectedValueOnce(new Error('Tag is read-only'));
  await expect(writeNfcLabel('bw:test')).rejects.toThrow('read-only');
  expect(await readNfcLabel()).toBe('001234567890');
});
test('overlapping NFC requests are rejected and cancellation prevents a late write', async () => {
  let finishSupportCheck;
  manager.isSupported.mockImplementationOnce(() => new Promise(resolve => { finishSupportCheck = resolve; }));
  const first = writeNfcLabel('bw:cancelled');
  const rejected = expect(first).rejects.toThrow('cancelled');
  await expect(readNfcLabel()).rejects.toThrow('already running');
  await cancelNfc(); finishSupportCheck(true); await rejected;
  expect(manager.requestTechnology).not.toHaveBeenCalled();
  expect(manager.ndefHandler.writeNdefMessage).not.toHaveBeenCalled();
});
