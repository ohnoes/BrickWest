import React, { useState } from 'react';
import { ScrollView, TextInput, Button, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
export default function NewBatchScreen({ navigation }) {
  const [number, setNumber] = useState('');
  const [volume, setVolume] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!number.trim() || (volume && (!Number.isFinite(Number(volume)) || Number(volume) <= 0))) {
      Alert.alert('Check your batch', 'Enter a batch number and a positive volume.');
      return;
    }
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('authToken');
      const { data } = await axios.post(`${API_URL}/batches`, {
        batch_number: number.trim(), volume_produced: volume ? Number(volume) : null,
        brew_date: new Date().toISOString().slice(0, 10)
      }, { headers: { Authorization: `Bearer ${token}` } });
      navigation.replace('BatchDetail', { batchId: data.id });
    } catch (error) { Alert.alert('Unable to create batch', error.response?.data?.error || 'Please try again.'); }
    finally { setSaving(false); }
  };
  const style = { color: '#fff', backgroundColor: '#2a2a2a', padding: 16, marginBottom: 16 };
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#1a1a1a', padding: 16 }}>
      <TextInput style={style} placeholderTextColor="#999" placeholder="Batch number" value={number} onChangeText={setNumber} editable={!saving} />
      <TextInput style={style} placeholderTextColor="#999" placeholder="Volume in liters (optional)" value={volume} onChangeText={setVolume} keyboardType="decimal-pad" editable={!saving} />
      <Button title={saving ? 'Saving…' : 'Create batch'} onPress={save} disabled={saving} color="#d4a574" />
    </ScrollView>
  );
}
