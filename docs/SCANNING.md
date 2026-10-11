# Inventory labels and scanning

Open **Scan** in the web app or the phone app. A QR code, product barcode, or NFC label identifies an existing inventory item, lot, tank, or storage area. Lookup shows recorded stock, lot expiry, and reorder warnings. Scanning does not receive stock, consume stock, create tasks, or complete tasks. Task automation is deferred for this first version.

## Set up labels

1. Add stock items and receive lots on Inventory; add tanks on Today.
2. Add storage areas on Scan, then look up a lot and choose **Set area**. An area represents the current location of an entire lot; split lots need separate lot records. Every area change records the operator and previous/new area without changing the stock ledger.
3. Choose **Register label**, select the record, and leave the code blank to generate a label. To link a manufacturer's barcode, enter or scan its exact value, including leading zeros. A manufacturer barcode normally identifies an item; lot-specific codes identify individual lots.
4. Use **QR label** to display and print a QR sticker from the web app. The phone app can display the same QR image.
5. Choose **Write NFC** / **Write NFC label**, confirm replacing the tag contents, and hold a writable NDEF tag near the phone. The app stores the label code as an NDEF text record. Use **Read NFC tag** to look it up later.

Existing tags can also be programmed with a separate NFC writer using the exact label code as an NDEF text record. Raw chip UIDs, payment cards, and proprietary/non-NDEF tags are not used. Labels contain identifiers, not credentials or stock quantities. All inventory lookup and management APIs require a signed-in user. Retiring a label disables every physical copy of that code; retired codes cannot be reused.

Expiry warnings show stock expiring within seven days or already expired; reorder warnings use the item's existing reorder point. These are displayed on lookup, not background push notifications. Tank contents come from its current batch assignment and the batch's recorded production volume, not from a sensor or current liquid-level measurement.

## Browser use

QR/barcode scanning runs locally using the bundled ZXing decoder. Camera access needs HTTPS or localhost and camera permission. Stop, leaving the page, or hiding the page shuts down the scanner. A code can always be typed or entered by a keyboard-wedge scanner.

Browser NFC uses Web NFC on supported devices (notably Chrome on Android). Unsupported browsers show a phone-app/QR alternative. iPhone NFC uses the native phone app. See [Chrome's Web NFC documentation](https://developer.chrome.com/docs/capabilities/nfc) for browser and hardware constraints.

## Native phone setup

The repository still does not contain Android/iOS project scaffolding. Integrate the mobile source into a React Native 0.72 project using the legacy architecture before building a phone binary. Native scanning requires rebuilding the app after dependency installation; this is not an Expo Go feature.

Install from `mobile/package-lock.json` with `npm ci`. The modules are pinned: `react-native-camera-kit` 13.0.0, `react-native-nfc-manager` 3.17.5, and `react-native-permissions` 3.10.1. NFC v3 matches the app's legacy React Native architecture.

For Android, add to `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.NFC" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
<uses-feature android:name="android.hardware.nfc" android:required="false" />
```

Enable Kotlin as required by Camera Kit. The app requests camera permission at runtime. NFC is optional, so phones without it retain QR/manual lookup.

For iOS, add `NSCameraUsageDescription` and `NFCReaderUsageDescription` to `Info.plist`. Enable the **Near Field Communication Tag Reading** capability in Xcode and the app's signing profile. Include `TAG` in `com.apple.developer.nfc.readersession.formats` in the entitlements file: NFC Manager's `requestTechnology` uses a tag-reader session even for NDEF payloads. Configure the camera permission handler in the Podfile:

```ruby
require_relative '../node_modules/react-native-permissions/scripts/setup'
setup_permissions(['Camera'])
```

Then run `pod install` and rebuild. Consult the installed modules' READMEs for the complete platform setup: [Camera Kit](https://github.com/teslamotors/react-native-camera-kit/tree/v13.0.0), [NFC Manager](https://github.com/revtel/react-native-nfc-manager), and [Permissions](https://github.com/zoontek/react-native-permissions/tree/3.10.1).

## Verification before release

Backend integration tests run against a disposable PostgreSQL database with `NODE_ENV=test`; they cover all four target types, repeated read-only lookup, barcode leading zeros, QR decoding, duplicate/retired codes, and audited area changes. `mobile` tests cover NFC read/write payloads, failed/unsupported tags, cancellation, and overlapping sessions with native mocks.

Physical device testing is still required: on Android and iPhone, grant/deny camera permission, read the printed QR and a product barcode, write/read a blank NDEF tag, try a read-only tag, cancel a scan, background the app, and switch tabs. Confirm the returned record and stock before labeling production equipment. Hardware behavior has not been verified by the automated tests.

## API

All endpoints are under `/api/scan` and require a Bearer token:

| Endpoint | Purpose |
| --- | --- |
| `POST /resolve` `{code}` | Read inventory for a registered label |
| `GET /targets` | List items, lots, tanks, and areas available to label |
| `GET /labels` | List up to 500 active labels |
| `POST /labels` `{kind,target_id,code?}` | Register `item`, `lot`, `vessel`, or `area`; omit code to generate one |
| `DELETE /labels/:id` | Retire the code without deleting its record |
| `GET /labels/:id/qr` | QR SVG |
| `GET /labels/:id/qr-image` | QR PNG as `{image: dataURL}` |
| `GET /areas`, `POST /areas` `{name}` | Manage storage areas |
| `PATCH /lots/:id/area` `{area_id}` | Move a whole lot; use `null` to clear its area |

Startup applies `backend/scripts/scanning.sql` after the existing operations and inventory schemas. No existing tables or ledger entries are replaced.
