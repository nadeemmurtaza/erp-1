import * as Notifications from 'expo-notifications';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider, useI18n } from '../src/i18n';
import { AuthProvider } from '../src/state/auth';
import { CartProvider } from '../src/state/cart';
import { theme } from '../src/theme';

// A push about a garment should be visible even with the app open — that is the
// moment the customer most wants to see it.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AuthProvider>
          <CartProvider>
            <StatusBar style="dark" />
            <Navigation />
          </CartProvider>
        </AuthProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

function Navigation() {
  const { t } = useI18n();

  // Tapping a stage notification opens that garment rather than the home screen.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as {
        reference?: string;
        template?: string;
      };

      if (!data?.reference) return;
      if (data.reference.startsWith('STO-')) router.push(`/stitching/${data.reference}`);
      else router.push(`/orders/${data.reference}`);
    });

    return () => subscription.remove();
  }, []);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.color.sand },
        headerTintColor: theme.color.ink,
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: theme.color.sand },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="product/[slug]" options={{ title: '' }} />
      <Stack.Screen name="checkout" options={{ title: t('checkout.title') }} />
      <Stack.Screen name="login" options={{ title: t('account.signIn'), presentation: 'modal' }} />
      <Stack.Screen name="orders/index" options={{ title: t('orders.title') }} />
      <Stack.Screen name="orders/[number]" options={{ title: '' }} />
      <Stack.Screen name="stitching/[number]" options={{ title: '' }} />
      <Stack.Screen name="measurements/index" options={{ title: t('measurements.title') }} />
      <Stack.Screen name="measurements/edit" options={{ title: t('measurements.add') }} />
      <Stack.Screen name="workshop/index" options={{ title: t('workshop.title') }} />
      <Stack.Screen name="workshop/[id]" options={{ title: '' }} />
    </Stack>
  );
}
