import React, { useState, useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { AuthContext } from '../auth/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../brand';

const SettingsScreen = () => {
  const { signOut } = useContext(AuthContext);
  const [user, setUser] = useState(null);

  React.useEffect(() => {
    const getUser = async () => {
      const u = await AsyncStorage.getItem('user');
      if (u) {
        setUser(JSON.parse(u));
      }
    };
    getUser();
  }, []);

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure?', [
      { text: 'Cancel' },
      {
        text: 'Logout',
        onPress: async () => {
          await signOut();
        }
      }
    ]);
  };

  return (
    <View style={styles.container}>
      {user && (
        <View style={styles.userCard}>
          <Text style={styles.userName}>{user.name}</Text>
          <Text style={styles.userEmail}>{user.email}</Text>
          <Text style={styles.userRole}>{user.role}</Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App Info</Text>
        <View style={styles.item}>
          <Text style={styles.label}>Version</Text>
          <Text style={styles.value}>1.0.0</Text>
        </View>
        <View style={styles.item}>
          <Text style={styles.label}>API</Text>
          <Text style={styles.value}>{process.env.REACT_APP_API_URL || 'http://localhost:3001'}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 16
  },
  userCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: colors.amber
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 6
  },
  userEmail: {
    fontSize: 14,
    color: colors.amber,
    marginBottom: 4
  },
  userRole: {
    fontSize: 12,
    color: '#999',
    textTransform: 'uppercase'
  },
  section: {
    marginBottom: 24
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
    textTransform: 'uppercase'
  },
  item: {
    backgroundColor: colors.surface,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
    borderRadius: 8
  },
  label: {
    color: '#999',
    fontSize: 14
  },
  value: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600'
  },
  logoutButton: {
    backgroundColor: '#c0392b',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center'
  },
  logoutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold'
  }
});

export default SettingsScreen;
