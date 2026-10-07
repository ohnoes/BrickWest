import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const BatchDetailScreen = ({ route, navigation }) => {
  const { batchId } = route.params;
  const [batch, setBatch] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null);

  // Log entry form
  const [temperature, setTemperature] = useState('');
  const [gravity, setGravity] = useState('');
  const [ph, setPh] = useState('');
  const [notes, setNotes] = useState('');
  const [logging, setLogging] = useState(false);

  useEffect(() => {
    const getToken = async () => {
      const t = await AsyncStorage.getItem('authToken');
      setToken(t);
    };
    getToken();
  }, []);

  useEffect(() => {
    if (token) {
      fetchBatchData();
    }
  }, [token]);

  const fetchBatchData = async () => {
    try {
      setLoading(true);
      const [batchRes, logsRes] = await Promise.all([
        axios.get(`${API_URL}/batches/${batchId}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_URL}/batches/${batchId}/logs`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      setBatch(batchRes.data);
      setLogs(logsRes.data);
    } catch (error) {
      Alert.alert('Error', 'Failed to load batch details');
    } finally {
      setLoading(false);
    }
  };

  const handleLogReading = async () => {
    if (!temperature || !gravity) {
      Alert.alert('Error', 'Temperature and gravity are required');
      return;
    }

    setLogging(true);
    try {
      await axios.post(
        `${API_URL}/batches/${batchId}/logs`,
        {
          phase: batch.status,
          temperature: parseFloat(temperature),
          gravity: parseFloat(gravity),
          ph: ph ? parseFloat(ph) : null,
          notes
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      Alert.alert('Success', 'Reading logged');
      setTemperature('');
      setGravity('');
      setPh('');
      setNotes('');
      fetchBatchData();
    } catch (error) {
      Alert.alert('Error', 'Failed to log reading');
    } finally {
      setLogging(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#d4a574" />
      </View>
    );
  }

  if (!batch) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Batch not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.batchNumber}>{batch.batch_number}</Text>
        <Text style={styles.status}>{batch.status}</Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.label}>Volume</Text>
        <Text style={styles.value}>{batch.volume_produced}L</Text>

        <Text style={styles.label}>Brew Date</Text>
        <Text style={styles.value}>{new Date(batch.brew_date).toLocaleDateString()}</Text>

        {batch.notes && (
          <>
            <Text style={styles.label}>Notes</Text>
            <Text style={styles.value}>{batch.notes}</Text>
          </>
        )}
      </View>

      <View style={styles.logSection}>
        <Text style={styles.sectionTitle}>Log Fermentation Reading</Text>

        <TextInput
          style={styles.input}
          placeholder="Temperature (°C)"
          placeholderTextColor="#999"
          value={temperature}
          onChangeText={setTemperature}
          keyboardType="decimal-pad"
        />

        <TextInput
          style={styles.input}
          placeholder="Gravity (SG)"
          placeholderTextColor="#999"
          value={gravity}
          onChangeText={setGravity}
          keyboardType="decimal-pad"
        />

        <TextInput
          style={styles.input}
          placeholder="pH (optional)"
          placeholderTextColor="#999"
          value={ph}
          onChangeText={setPh}
          keyboardType="decimal-pad"
        />

        <TextInput
          style={[styles.input, styles.notesInput]}
          placeholder="Notes (optional)"
          placeholderTextColor="#999"
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        <TouchableOpacity
          style={[styles.button, logging && styles.buttonDisabled]}
          onPress={handleLogReading}
          disabled={logging}
        >
          <Text style={styles.buttonText}>
            {logging ? 'Logging...' : 'Log Reading'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.historySection}>
        <Text style={styles.sectionTitle}>Reading History</Text>
        {logs.length === 0 ? (
          <Text style={styles.noData}>No readings yet</Text>
        ) : (
          logs.map((log) => (
            <View key={log.id} style={styles.logEntry}>
              <Text style={styles.logTime}>
                {new Date(log.measured_at).toLocaleString()}
              </Text>
              <Text style={styles.logData}>
                🌡️ {log.temperature}°C | 📊 {log.gravity} SG
                {log.ph && ` | pH ${log.ph}`}
              </Text>
              {log.notes && <Text style={styles.logNotes}>{log.notes}</Text>}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a'
  },
  header: {
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 16,
    paddingVertical: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  batchNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff'
  },
  status: {
    color: '#d4a574',
    fontSize: 12,
    textTransform: 'uppercase',
    fontWeight: '600'
  },
  infoCard: {
    backgroundColor: '#2a2a2a',
    margin: 12,
    padding: 16,
    borderRadius: 8
  },
  label: {
    color: '#999',
    fontSize: 12,
    marginTop: 12,
    marginBottom: 4
  },
  value: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },
  logSection: {
    backgroundColor: '#2a2a2a',
    margin: 12,
    padding: 16,
    borderRadius: 8
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    marginBottom: 12
  },
  notesInput: {
    height: 80,
    textAlignVertical: 'top'
  },
  button: {
    backgroundColor: '#d4a574',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 8
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    color: '#000',
    fontWeight: 'bold'
  },
  historySection: {
    backgroundColor: '#2a2a2a',
    margin: 12,
    padding: 16,
    borderRadius: 8,
    marginBottom: 40
  },
  logEntry: {
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 6,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#d4a574'
  },
  logTime: {
    color: '#999',
    fontSize: 12,
    marginBottom: 6
  },
  logData: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600'
  },
  logNotes: {
    color: '#ccc',
    fontSize: 12,
    marginTop: 6,
    fontStyle: 'italic'
  },
  noData: {
    color: '#666',
    textAlign: 'center',
    paddingVertical: 20
  },
  errorText: {
    color: '#ff6b6b',
    textAlign: 'center',
    marginTop: 20
  }
});

export default BatchDetailScreen;
