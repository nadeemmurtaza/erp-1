import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { useI18n } from '../../src/i18n';
import { useCart } from '../../src/state/cart';
import { theme } from '../../src/theme';

/**
 * The four places the app goes.
 *
 * Icons are emoji rather than an icon font: they render identically on both
 * platforms with nothing to bundle, and each tab carries its label anyway, so
 * the glyph is decoration rather than the only signal.
 */
export default function TabsLayout() {
  const { t } = useI18n();
  const { count } = useCart();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.color.sand },
        headerTintColor: theme.color.ink,
        tabBarActiveTintColor: theme.color.brand,
        tabBarInactiveTintColor: theme.color.inkSoft,
        sceneStyle: { backgroundColor: theme.color.sand },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tab.shop'),
          tabBarIcon: ({ color }) => <TabIcon glyph="🧵" color={color} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: t('tab.cart'),
          tabBarBadge: count > 0 ? count : undefined,
          tabBarIcon: ({ color }) => <TabIcon glyph="🛍️" color={color} />,
        }}
      />
      <Tabs.Screen
        name="stitching"
        options={{
          title: t('tab.stitching'),
          tabBarIcon: ({ color }) => <TabIcon glyph="✂️" color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('tab.account'),
          tabBarIcon: ({ color }) => <TabIcon glyph="👤" color={color} />,
        }}
      />
    </Tabs>
  );
}

function TabIcon({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={{ fontSize: 18, color }}>{glyph}</Text>;
}
