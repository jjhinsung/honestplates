import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { Text } from 'react-native';
import { DashboardScreen } from '../screens/DashboardScreen';
import { IngredientDetailScreen } from '../screens/IngredientDetailScreen';
import { IngredientReportScreen } from '../screens/IngredientReportScreen';
import { IngredientsScanScreen } from '../screens/IngredientsScanScreen';
import { LabelReviewScreen } from '../screens/LabelReviewScreen';
import { ManualEntryScreen } from '../screens/ManualEntryScreen';
import { PlateReviewScreen } from '../screens/PlateReviewScreen';
import { ScanLabelScreen } from '../screens/ScanLabelScreen';
import { ScanPlateScreen } from '../screens/ScanPlateScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { colors } from '../theme';
import type { RootStackParamList, TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const icon = (glyph: string) => ({ focused }: { focused: boolean }) =>
  <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{glyph}</Text>;

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}>
      <Tab.Screen name="Today" component={DashboardScreen} options={{ tabBarIcon: icon('📊') }} />
      <Tab.Screen
        name="ScanLabel"
        component={ScanLabelScreen}
        options={{ title: 'Label', tabBarIcon: icon('🏷️') }}
      />
      <Tab.Screen
        name="ScanPlate"
        component={ScanPlateScreen}
        options={{ title: 'Plate', tabBarIcon: icon('🍽️') }}
      />
      <Tab.Screen
        name="Ingredients"
        component={IngredientsScanScreen}
        options={{ title: 'Ingredients', tabBarIcon: icon('🔍') }}
      />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarIcon: icon('⚙️') }} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerTintColor: colors.primary }}>
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="LabelReview" component={LabelReviewScreen} options={{ title: 'Review label' }} />
      <Stack.Screen name="PlateReview" component={PlateReviewScreen} options={{ title: 'Review plate' }} />
      <Stack.Screen
        name="ManualEntry"
        component={ManualEntryScreen}
        options={{ title: 'Add food', presentation: 'modal' }}
      />
      <Stack.Screen
        name="IngredientReport"
        component={IngredientReportScreen}
        options={{ title: "What's in it" }}
      />
      <Stack.Screen
        name="IngredientDetail"
        component={IngredientDetailScreen}
        options={{ title: 'Ingredient' }}
      />
    </Stack.Navigator>
  );
}
