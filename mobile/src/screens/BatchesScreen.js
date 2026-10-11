import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../brand';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const BatchesScreen = ({ navigation }) => {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [token, setToken] = useState(null);

  useEffect(() => {
    const getToken = async () => {
      const t = await AsyncStorage.getItem('authToken');
      setToken(t);
    };
    getToken();
  }, []);

  useEffect(() => {
    if (token) {
      fetchBatches();
    }
  }, [token, filter]);

  const fetchBatches = async () => {
    try {
      setLoading(true);
      const url = filter === 'all' 
        ? `${API_URL}/batches`
        : `${API_URL}/batches?status=${filter}`;

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBatches(response.data);
    } catch (error) {
      console.error('Failed to fetch batches:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchBatches();
    setRefreshing(false);
  };

  const renderBatch = ({ item }) => (
    <TouchableOpacity
      style={styles.batchCard}
      onPress={() => navigation.navigate('BatchDetail', { batchId: item.id })}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.batchNumber}>{item.batch_number}</Text>
        <Text style={[styles.status, getStatusColor(item.status)]}>
          {item.status}
        </Text>
      </View>
      <Text style={styles.recipeId}>Recipe ID: {item.recipe_id}</Text>
      <Text style={styles.volume}>{item.volume_produced}L</Text>
      <Text style={styles.date}>{new Date(item.brew_date).toLocaleDateString()}</Text>
    </TouchableOpacity>
  );

  const getStatusColor = (status) => {
    const colors = {
      milling: { color: '#999' },
      mashing: { color: '#ffa500' },
      boiling: { color: '#ff6b6b' },
      cooling: { color: '#87ceeb' },
      fermenting: { color: '#4ecdc4' },
      packaging: { color: '#95e1d3' },
      complete: { color: '#6bcf7f' },
      discarded: { color: '#333' }
    };
    return colors[status] || colors.milling;
  };

  return (
    <View style={styles.container}>
      <View style={styles.filterContainer}>
        {['all', 'fermenting', 'complete', 'discarded'].map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.filterButton, filter === s && styles.filterButtonActive]}
            onPress={() => setFilter(s)}
          >
            <Text style={[styles.filterText, filter === s && styles.filterTextActive]}>
              {s}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.amber} style={styles.loader} />
      ) : (
        <FlatList
          data={batches}
          renderItem={renderBatch}
          keyExtractor={(item) => item.id.toString()}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContent}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('NewBatch')}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    gap: 8
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#333'
  },
  filterButtonActive: {
    backgroundColor: colors.amber
  },
  filterText: {
    color: '#999',
    fontSize: 12,
    textTransform: 'capitalize'
  },
  filterTextActive: {
    color: '#000',
    fontWeight: 'bold'
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  batchCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: colors.amber
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  batchNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff'
  },
  status: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#333',
    borderRadius: 4
  },
  recipeId: {
    color: '#999',
    fontSize: 12,
    marginBottom: 4
  },
  volume: {
    color: colors.amber,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4
  },
  date: {
    color: '#666',
    fontSize: 12
  },
  loader: {
    flex: 1,
    justifyContent: 'center'
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.amber,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4
  },
  fabText: {
    fontSize: 32,
    color: '#000',
    fontWeight: 'bold'
  }
});

export default BatchesScreen;
