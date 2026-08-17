import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { formatMoney } from '@yaseen/shared';
import * as resources from '../../src/api/resources';
import type { Order } from '../../src/api/types';
import { Body, Card, Empty, ErrorNote, Loading, Screen, Small } from '../../src/components/ui';
import { useI18n } from '../../src/i18n';
import { theme } from '../../src/theme';

/** Everything this customer has ordered, newest first. */
export default function OrdersScreen() {
  const { t, locale, date } = useI18n();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void resources
      .myOrders()
      .then((page) => setOrders(page.data))
      .catch(() => {
        setError(t('common.offline'));
        setOrders([]);
      });
  }, [t]);

  if (!orders) return <Screen><Loading /></Screen>;

  if (orders.length === 0) {
    return (
      <Screen>
        <ErrorNote message={error} />
        <Empty message={t('orders.empty')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {orders.map((order) => (
          <Link key={order.id} href={`/orders/${order.number}`} asChild>
            <Pressable accessibilityRole="button">
              <Card>
                <Body>{order.number}</Body>
                <Small muted>{t('orders.placedOn', { date: date(order.placedAt) })}</Small>
                <Small>{t(`status.${order.status}` as never)}</Small>
                <Body>{formatMoney(order.grandTotal, locale)}</Body>
              </Card>
            </Pressable>
          </Link>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(3) },
});
