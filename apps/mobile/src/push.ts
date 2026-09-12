import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { THEME_COLORS } from '@yaseen/shared';
import * as resources from './api/resources';

const TOKEN_KEY = 'yaseen.pushToken';

/**
 * Push notifications, for watching a garment being made.
 *
 * The API sends one on every stage change, so the customer hears "being cut",
 * "being stitched", "ready" without opening the app. The token is registered
 * against the account, which is why this only runs once someone is signed in.
 *
 * A simulator has no push token and never will; that is not an error worth
 * showing anyone, so it returns quietly.
 */
export async function registerForPush(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;

  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('stitching', {
      name: 'Your garments',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: THEME_COLORS.accent.DEFAULT,
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants.easConfig as { projectId?: string } | undefined)?.projectId;

  const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined))
    .data;

  await AsyncStorage.setItem(TOKEN_KEY, token);
  await resources.registerDevice({
    token,
    platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
    appVersion: Constants.expoConfig?.version ?? undefined,
    locale: (await AsyncStorage.getItem('yaseen.locale')) ?? undefined,
  });

  return token;
}

/** Takes this handset off the list — called on sign-out, before the token dies. */
export async function unregisterPush(): Promise<void> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return;

  await resources.unregisterDevice(token);
  await AsyncStorage.removeItem(TOKEN_KEY);
}

/** Whether this phone is currently on the list. */
export async function pushRegistered(): Promise<boolean> {
  return Boolean(await AsyncStorage.getItem(TOKEN_KEY));
}
