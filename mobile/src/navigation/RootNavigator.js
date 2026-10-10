import React from 'react';
import { Text } from 'react-native';
import { AuthContext } from '../auth/AuthContext';
import RegisterScreen from '../screens/RegisterScreen';
import NewBatchScreen from '../screens/NewBatchScreen';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';

import LoginScreen from '../screens/LoginScreen';
import BatchesScreen from '../screens/BatchesScreen';
import BreweryTodayScreen from '../screens/BreweryTodayScreen';
import BatchDetailScreen from '../screens/BatchDetailScreen';
import RecipesScreen from '../screens/RecipesScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const BatchesNavigator = () => (
  <Stack.Navigator
    initialRouteName="BatchesList"
    screenOptions={{
      headerStyle: { backgroundColor: '#2a2a2a' },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: 'bold' }
    }}
  >
    <Stack.Screen name="NewBatch" component={NewBatchScreen} options={{ title: 'New Batch' }} />
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
  const auth = React.useMemo(() => ({
    signIn: async (token, user) => {
      await AsyncStorage.multiSet([['authToken', token], ['user', JSON.stringify(user)]]);
      setInitialRoute('Main');
    },
    signOut: async () => {
      await AsyncStorage.multiRemove(['authToken', 'user']);
      setInitialRoute('Login');
    }
  }), []);

  React.useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await AsyncStorage.getItem('authToken');
        setInitialRoute(token ? 'Main' : 'Login');
      } catch { setInitialRoute('Login'); }
    };
    checkAuth();
  }, []);

  if (initialRoute === 'Loading') {
    return null;
  }

  return (
    <AuthContext.Provider value={auth}>
    <NavigationContainer>
      {initialRoute === 'Login' ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
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
            name="Today"
            component={BreweryTodayScreen}
            options={{
              title: 'Brewery Today',
              tabBarLabel: 'Today',
              tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🏭</Text>
            }}
          />
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
    </AuthContext.Provider>
  );
};

export default RootNavigator;
