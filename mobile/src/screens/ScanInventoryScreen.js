import React, { useState, useEffect, useRef } from 'react';
import { ScrollView, View, Text, TextInput, Button, Alert, Image, Platform, PermissionsAndroid, AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Camera, CameraType } from 'react-native-camera-kit';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { readNfcLabel, writeNfcLabel, cancelNfc } from '../services/nfc';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const textStyle = { color: '#fff', marginVertical: 8 };
const fieldStyle = { backgroundColor: '#2a2a2a', color: '#fff', padding: 12, marginVertical: 8 };
export default function ScanInventoryScreen() {
  const focused = useIsFocused();
  const [code, setCode] = useState('');
  const [inventory, setInventory] = useState(null);
  const [labels, setLabels] = useState([]);
  const [targets, setTargets] = useState([]);
  const [areas, setAreas] = useState([]);
  const [target, setTarget] = useState(null);
  const [showTargets, setShowTargets] = useState(false);
  const [areaName, setAreaName] = useState('');
  const [areaLot, setAreaLot] = useState(null);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [qr, setQr] = useState(null);
  const active = useRef(false);
  const locked = useRef(false);
  const requestId = useRef(0);
  const stop = () => { requestId.current++; setCamera(false); cancelNfc(); };
  const call = async (method, path, data) => {
    const token = await AsyncStorage.getItem('authToken');
    const response = await axios({ method, url: `${API_URL}${path}`, data, headers: { Authorization: `Bearer ${token}` } });
    return response.data;
  };
  const fail = error => setMessage(error.response?.data?.error || error.message || 'Unable to scan. Try the QR label or enter its code.');
  const load = async () => {
    try {
      const [l, t, a] = await Promise.all([call('GET', '/scan/labels'), call('GET', '/scan/targets'), call('GET', '/scan/areas')]);
      if (active.current) { setLabels(l); setTargets(t); setAreas(a); }
    } catch (error) { if (active.current) fail(error); }
  };
  useEffect(() => {
    active.current = focused;
    if (focused) load(); else { setCamera(false); cancelNfc(); requestId.current++; }
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') stop(); });
    return () => { active.current = false; requestId.current++; cancelNfc(); listener.remove(); };
  }, [focused]);
  const lookup = async raw => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setCamera(false); setInventory(null); setQr(null); setCode(raw);
    const current = ++requestId.current;
    try {
      const value = await call('POST', '/scan/resolve', { code: raw });
      if (active.current && current === requestId.current) { setInventory(value); setMessage('Inventory shown. No stock or tasks changed.'); }
    } catch (error) { if (active.current && current === requestId.current) fail(error); }
    finally { locked.current = false; if (active.current) setBusy(false); }
  };
  const startCamera = async () => {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    stop(); const current = requestId.current;
    try {
      const allowed = Platform.OS === 'android'
        ? await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA) === PermissionsAndroid.RESULTS.GRANTED
        : await request(PERMISSIONS.IOS.CAMERA) === RESULTS.GRANTED;
      if (active.current && current === requestId.current) {
        if (allowed) { setCamera(true); setMessage('Point your camera at a QR code or barcode.'); }
        else setMessage('Allow camera access in Settings, or enter the label code.');
      }
    } catch (error) { if (active.current) fail(error); }
    finally { locked.current = false; if (active.current) setBusy(false); }
  };
  const readTag = async () => {
    if (locked.current) return;
    stop(); locked.current = true; setBusy(true); setMessage('Hold your phone near the NFC tag.');
    const current = requestId.current; let value;
    try { value = await readNfcLabel(); }
    catch (error) { if (active.current && current === requestId.current) fail(error); }
    finally { locked.current = false; if (active.current) setBusy(false); }
    if (value && active.current && current === requestId.current) await lookup(value);
  };
  const writeTag = label => Alert.alert('Write NFC label', `Write ${label.target_name} to a tag? This replaces its existing contents.`, [
    { text: 'Cancel', style: 'cancel' }, { text: 'Write', onPress: async () => {
      if (locked.current) return;
      stop(); locked.current = true; setBusy(true); setMessage('Hold a writable NFC tag near your phone.');
      const current = requestId.current;
      try { await writeNfcLabel(label.code); if (active.current && current === requestId.current) setMessage('NFC label written.'); }
      catch (error) { if (active.current && current === requestId.current) fail(error); }
      finally { locked.current = false; if (active.current) setBusy(false); }
    } }
  ]);
  const register = async () => {
    if (!target || locked.current) return;
    stop();
    locked.current = true; setBusy(true);
    try {
      const label = await call('POST', '/scan/labels', { kind: target.kind, target_id: target.id, ...(code.trim() ? { code: code.trim() } : {}) });
      if (active.current) { setCode(label.code); setMessage('Label registered. Show its QR or write it to NFC below.'); await load(); }
    } catch (error) { if (active.current) fail(error); }
    finally { locked.current = false; if (active.current) setBusy(false); }
  };
  const setArea = async areaId => {
    if (!areaLot || locked.current) return;
    locked.current = true; setBusy(true);
    try { await call('PATCH', `/scan/lots/${areaLot}/area`, { area_id: areaId }); setAreaLot(null); }
    catch (error) { fail(error); }
    finally { locked.current = false; setBusy(false); }
    await lookup(code);
  };
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#1a1a1a', padding: 16 }}>
      <Text style={textStyle}>Scan stock, a tank, or a storage area</Text>
      <Button title="Scan QR / barcode" onPress={startCamera} disabled={busy || camera} />
      <Button title="Read NFC tag" onPress={readTag} disabled={busy || camera} />
      <Button title="Stop scanning" onPress={() => { stop(); setMessage('Scanner stopped.'); }} />
      {focused && camera && <Camera style={{ height: 280 }} cameraType={CameraType.Back} scanBarcode showFrame
        onReadCode={event => lookup(event.nativeEvent.codeStringValue)} />}
      <TextInput style={fieldStyle} placeholder="Label code or existing barcode" placeholderTextColor="#999" value={code} onChangeText={setCode} autoCapitalize="none" editable={!busy} />
      <Button title="Look up inventory" onPress={() => lookup(code)} disabled={busy || !code.trim()} />
      <Text accessibilityLiveRegion="polite" style={textStyle}>{message}</Text>
      {inventory && <View>
        <Text style={textStyle}>{inventory.target.name || inventory.target.lot_number}</Text>
        {inventory.kind === 'item' && <Text style={textStyle}>On hand: {inventory.on_hand} {inventory.target.unit}</Text>}
        {inventory.kind === 'vessel' && <Text style={textStyle}>{inventory.batch
          ? `Batch ${inventory.batch.batch_number} · ${inventory.batch.status} · ${inventory.batch.volume_produced ?? 'Unrecorded'} liters produced`
          : 'No active batch assigned'}. Tank contents reflect the batch assignment, not a live measurement.</Text>}
        {inventory.reminders.map((r, index) => <Text key={index} style={{ ...textStyle, color: '#ffb66b' }}>{r.message}</Text>)}
        {inventory.lots.map(lot => <View key={lot.id} style={{ marginBottom: 12 }}>
          <Text style={textStyle}>{lot.item_name} · Lot {lot.lot_number} · {lot.on_hand} {lot.unit}</Text>
          <Text style={textStyle}>Area: {lot.area_name || 'Unassigned'} · Expiry: {lot.expires_on ? new Date(lot.expires_on).toLocaleDateString() : 'Not set'}</Text>
          <Button title="Set storage area" onPress={() => setAreaLot(lot.id)} disabled={busy} />
        </View>)}
        {areaLot && <View><Button title="Unassigned" onPress={() => setArea(null)} disabled={busy} />
          {areas.map(a => <Button key={a.id} title={a.name} onPress={() => setArea(a.id)} disabled={busy} />)}
          <Button title="Cancel area selection" onPress={() => setAreaLot(null)} /></View>}
      </View>}
      <Text style={textStyle}>Register labels</Text>
      <Button title={target ? `${target.kind}: ${target.name}` : 'Choose a record to label'} onPress={() => setShowTargets(!showTargets)} disabled={busy} />
      {showTargets && targets.map(t => <Button key={`${t.kind}:${t.id}`} title={`${t.kind}: ${t.name}`} onPress={() => { setTarget(t); setShowTargets(false); }} />)}
      <Text style={textStyle}>Use the code above for an existing barcode. Clear it to generate a new QR/NFC label.</Text>
      <Button title="Register label" onPress={register} disabled={busy || !target} />
      <TextInput style={fieldStyle} placeholder="New storage area name" placeholderTextColor="#999" value={areaName} onChangeText={setAreaName} editable={!busy} />
      <Button title="Add area" disabled={busy || !areaName.trim()} onPress={async () => {
        if (locked.current) return; locked.current = true; setBusy(true);
        try { await call('POST', '/scan/areas', { name: areaName }); setAreaName(''); await load(); }
        catch (error) { fail(error); } finally { locked.current = false; setBusy(false); }
      }} />
      <Text style={textStyle}>Registered labels</Text>
      {labels.map(label => <View key={label.id} style={{ marginBottom: 16 }}>
        <Text style={textStyle}>{label.target_name} · {label.code}</Text>
        <Button title="View inventory" onPress={() => lookup(label.code)} disabled={busy} />
        <Button title="Show QR label" disabled={busy} onPress={async () => {
          stop();
          try { const value = await call('GET', `/scan/labels/${label.id}/qr-image`); if (active.current) setQr({ image: value.image, name: label.target_name, code: label.code }); }
          catch (error) { if (active.current) fail(error); }
        }} />
        <Button title="Write NFC label" onPress={() => writeTag(label)} disabled={busy} />
      </View>)}
      {qr && <View><Text style={textStyle}>{qr.name} · {qr.code}</Text><Image style={{ width: 240, height: 240, backgroundColor: '#fff', marginBottom: 24 }} source={{ uri: qr.image }} accessibilityLabel={`QR label for ${qr.name}`} /></View>}
    </ScrollView>
  );
}
