import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { colors, greeting } from '../brand';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export default function BreweryTodayScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [vessels, setVessels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setError('');
      const token = await AsyncStorage.getItem('authToken');
      if (!token) throw new Error('Session expired. Please sign in again.');
      const config = { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 };
      const [overview, taskResponse, vesselResponse] = await Promise.all([
        axios.get(`${API}/team/today`, config),
        axios.get(`${API}/team/tasks`, config),
        axios.get(`${API}/team/vessels`, config)
      ]);
      setData(overview.data);
      setTasks(taskResponse.data.filter(task => ['open', 'in_progress'].includes(task.status)).slice(0, 8));
      setVessels(vesselResponse.data);
    } catch (e) {
      setError(e.response?.status === 401 ? 'Your session has expired. Sign out and back in.' : (e.message?.startsWith('Session expired') ? e.message : 'Could not update brewery data. Pull down to retry.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    refresh();
  }, [refresh]));

  const active = (data?.batches || []).reduce((sum, status) => sum + Number(status.count), 0);
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.body}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.amber} onRefresh={() => { setRefreshing(true); refresh(); }} />}>
      <Text style={styles.heading}>Brewery Today</Text>
      <Text style={styles.subtitle}>{greeting()}</Text>
      {loading && !data ? <ActivityIndicator color={colors.amber} size="large" /> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {data ? <>
        <View style={styles.metrics}>
          <Metric label="Active batches" value={active} />
          <Metric label="Tasks due today" value={data.tasks?.due_today ?? 0} />
          <Metric label="Overdue tasks" value={data.tasks?.overdue ?? 0} />
        </View>
        <Text style={styles.section}>Tank occupancy</Text>
        <Text style={styles.subtitle}>{data.vessels?.occupied ?? 0} of {data.vessels?.total ?? 0} active tanks assigned</Text>
        {vessels.length ? vessels.map(v => <View key={v.id} style={styles.card}>
          <Text style={styles.primary}>{v.name}</Text>
          <Text style={styles.secondary}>{v.batch_number ? `Occupied · ${v.batch_number}` : 'Available'}</Text>
          {v.capacity_liters != null ? <Text style={styles.secondary}>{v.capacity_liters} L capacity</Text> : null}
        </View>) : <Text style={styles.secondary}>No tanks configured yet.</Text>}
        <Text style={styles.section}>Upcoming work</Text>
        {tasks.length ? tasks.map(t => <View key={t.id} style={styles.card}>
          <Text style={styles.primary}>{t.title}</Text>
          <Text style={styles.secondary}>{t.status.replace('_', ' ')}{t.due_at ? ` · Due ${new Date(t.due_at).toLocaleString()}` : ' · No due date'}</Text>
        </View>) : <Text style={styles.secondary}>No open tasks.</Text>}
        <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Batches')}>
          <Text style={styles.buttonText}>View batches</Text>
        </TouchableOpacity>
      </> : null}
    </ScrollView>
  );
}

function Metric({ label, value }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, paddingBottom: 40 },
  heading: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 13, color: '#bbb', marginTop: 4, marginBottom: 12 },
  metrics: { flexDirection: 'row', gap: 8, marginVertical: 12 },
  metric: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: colors.surface },
  metricValue: { fontSize: 24, color: colors.amber, fontWeight: 'bold' },
  metricLabel: { fontSize: 11, color: '#ccc', marginTop: 5 },
  section: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginTop: 22, marginBottom: 8 },
  card: { padding: 14, backgroundColor: colors.surface, borderRadius: 10, marginBottom: 8 },
  primary: { color: '#fff', fontSize: 15, fontWeight: '600' },
  secondary: { color: '#bbb', fontSize: 13, marginTop: 5 },
  error: { color: '#ff9b8c', padding: 12, backgroundColor: '#4a2828', borderRadius: 8 },
  button: { marginTop: 22, padding: 14, borderRadius: 8, alignItems: 'center', backgroundColor: colors.amber },
  buttonText: { color: colors.bg, fontWeight: 'bold' }
});
