import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const RecipesScreen = ({ navigation }) => {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
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
      fetchRecipes();
    }
  }, [token]);

  const fetchRecipes = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/recipes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRecipes(response.data);
    } catch (error) {
      console.error('Failed to fetch recipes:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderRecipe = ({ item }) => (
    <View style={styles.recipeCard}>
      <View style={styles.cardHeader}>
        <Text style={styles.recipeName}>{item.name}</Text>
        <Text style={styles.style}>{item.style}</Text>
      </View>
      <Text style={styles.stats}>
        {item.target_abv}% ABV • {item.target_ibu} IBU • {item.volume_liters}L
      </Text>
      <Text style={styles.version}>v{item.version}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#d4a574" style={styles.loader} />
      ) : recipes.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No recipes yet</Text>
          <Text style={styles.emptySubtext}>Create one from the API</Text>
        </View>
      ) : (
        <FlatList
          data={recipes}
          renderItem={renderRecipe}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a'
  },
  loader: {
    flex: 1,
    justifyContent: 'center'
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  recipeCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#d4a574'
  },
  cardHeader: {
    marginBottom: 8
  },
  recipeName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4
  },
  style: {
    color: '#d4a574',
    fontSize: 12,
    textTransform: 'uppercase'
  },
  stats: {
    color: '#999',
    fontSize: 12,
    marginBottom: 6
  },
  version: {
    color: '#666',
    fontSize: 10,
    fontStyle: 'italic'
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8
  },
  emptySubtext: {
    color: '#999',
    fontSize: 14
  }
});

export default RecipesScreen;
