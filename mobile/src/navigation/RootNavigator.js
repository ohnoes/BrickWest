import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';

import LoginScreen from './screens/LoginScreen';
import BatchesScreen from './screens/BatchesScreen';
import BatchDetailScreen from './screens/BatchDetailScreen';
import RecipesScreen from './screens/RecipesScreen';
import SettingsScreen from './screens/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const BatchesNavigator = () => (
  <Stack.Navigator
    screenOptions={{
      headerStyle: { backgroundColor: '#2a2a2a' },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: 'bold' }
    }}
  >
    <Stack.Screen
      name="BatchesList"
      component={BatchesScreen}
      options={{ title: 'Batches' }}
    />
    <Stack.Screen
      name="BatchDetail"
      component={BatchDetailScreen}
      options={{ title: 'Batch Details' }}
    />
  </Stack.Navigator>
);

const RecipesNavigator = () => (
  <Stack.Navigator
    screenOptions={{
      headerStyle: { backgroundColor: '#2a2a2a' },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: 'bold' }
    }}
  >
    <Stack.Screen
      name="RecipesList"
      component={RecipesScreen}
      options={{ title: 'Recipes' }}
    />
  </Stack.Navigator>
);

const RootNavigator = () => {
  const [initialRoute, setInitialRoute] = React.useState('Loading');

  React.useEffect(() => {
    const checkAuth = async () => {
      const token = await AsyncStorage.getItem('authToken');
      setInitialRoute(token ? 'Main' : 'Login');
    };
    checkAuth();
  }, []);

  if (initialRoute === 'Loading') {
    return null;
  }

  return (
    <NavigationContainer>
      {initialRoute === 'Login' ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
      ) : (
        <Tab.Navigator
          screenOptions={{
            tabBarStyle: { backgroundColor: '#2a2a2a', borderTopColor: '#444' },
            tabBarActiveTintColor: '#d4a574',
            tabBarInactiveTintColor: '#666',
            headerStyle: { backgroundColor: '#2a2a2a' },
            headerTintColor: '#fff'
          }}
        >
          <Tab.Screen
            name="Batches"
            component={BatchesNavigator}
            options={{
              title: 'Batches',
              tabBarLabel: 'Batches',
              headerShown: false,
              tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🍺</Text>
            }}
          />
          <Tab.Screen
            name="Recipes"
            component={RecipesNavigator}
            options={{
              title: 'Recipes',
              tabBarLabel: 'Recipes',
              headerShown: false,
              tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📋</Text>
            }}
          />
          <Tab.Screen
            name="Settings"
            component={SettingsScreen}
            options={{
              title: 'Settings',
              tabBarLabel: 'Settings',
              headerShown: true,
              tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>⚙️</Text>
            }}
          />
        </Tab.Navigator>
      )}
    </NavigationContainer>
  );
};

export default RootNavigator;
