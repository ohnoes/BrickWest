import React, { useState, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert
} from 'react-native';
import axios from 'axios';
import { AuthContext } from '../auth/AuthContext';
import { colors, tagline, cheers } from '../brand';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const LoginScreen = ({ navigation }) => {
  const { signIn } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        email,
        password
      });

      const { token, user } = response.data;
      
      await signIn(token, user);
    } catch (error) {
      Alert.alert('Login Failed', error.response?.data?.error || 'Check your credentials');
    } finally {
      setLoading(false);
    }
  };

  // Easter egg: tap the title five times.
  const [taps, setTaps] = useState(0);
  const [line] = useState(tagline);
  const tapTitle = () => {
    const next = taps + 1;
    if (next >= 5) { setTaps(0); Alert.alert(cheers(), 'You found the shift beer. Now get back to work.'); }
    else setTaps(next);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title} onPress={tapTitle} suppressHighlighting>Brewmaster</Text>
      <Text style={styles.subtitle}>Brickwest Brewing</Text>
      <Text style={styles.tagline}>{line}</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#999"
        value={email}
        onChangeText={setEmail}
        editable={!loading}
        keyboardType="email-address"
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#999"
        value={password}
        onChangeText={setPassword}
        editable={!loading}
        secureTextEntry
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Login</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Register')}>
        <Text style={styles.link}>Don't have an account? Register</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    paddingHorizontal: 20
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center'
  },
  tagline: {
    fontSize: 13,
    fontStyle: 'italic',
    color: colors.amber,
    textAlign: 'center',
    marginBottom: 24,
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
    marginBottom: 40,
    textAlign: 'center'
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#444'
  },
  button: {
    backgroundColor: colors.amber,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold'
  },
  link: {
    color: colors.amber,
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14
  }
});

export default LoginScreen;
