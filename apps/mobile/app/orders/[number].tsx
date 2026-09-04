import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { formatMoney } from '@yaseen/shared';
import * as resources from '../../src/api/resources';
import type { Order } from '../../src/api/types';
import { StageRail } from '../../src/components/stage-rail';
import {
  Body,
  Card,
  ErrorNote,
  Heading,
  Loading,
  Row,
  Screen,
  Small,
  Title,
} from '../../src/components/ui';
import { useI18n } from '../../src/i18n';
import { theme } from '../../src/theme';

/**
 * One order: what was bought, where it is, and — for a stitched line — how far
 * along the garment is. The rail is the same one a standalone booking shows.
 */
export default function OrderScreen() {
  const { number, payment } = useLocalSearchParams<{ number: string; payment?: string }>();
  const { t, locale, date } = useI18n();

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrder(await resources.getOrder(number));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('common.offline'));
    }
  }, [number, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!order) {
    return (
      <Screen>{error ? <ErrorNote message={error} /> : <Loading />}</Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        <Title>{order.number}</Title>
        <Small muted>{t('orders.placedOn', { date: date(order.placedAt) })}</Small>
        <Body>{t(`status.${order.status}` as never)}</Body>

        {payment === 'success' ? (
          <Card style={styles.paymentOk}>
            <Heading>{t('order.paymentSuccess')}</Heading>
            <Body muted>{t('order.paymentSuccessBody')}</Body>
          </Card>
        ) : null}
        {payment === 'failed' ? (
          <Card style={styles.paymentFailed}>
            <Heading>{t('order.paymentFailed')}</Heading>
            <Body muted>{t('order.paymentFailedBody')}</Body>
          </Card>
        ) : null}

        <Card>
          <Heading>{t('order.items')}</Heading>
          {order.items.map((item) => (
            <View key={item.id} style={styles.item}>
              <View style={styles.itemHead}>
                <Body>
                  {locale === 'ur' && item.nameUr ? item.nameUr : item.nameEn} × {item.quantity}
                </Body>
                <Body>{formatMoney(item.lineTotal, locale)}</Body>
              </View>
              {item.variantLabel ? <Small muted>{item.variantLabel}</Small> : null}

              {item.stitchingServiceName ? (
                <Small muted>
                  {item.stitchingServiceName}
                  {item.measurementSnapshot ? ` · ${item.measurementSnapshot.label}` : ''}
                </Small>
              ) : null}

              {item.stitchingJob ? (
                <View style={styles.rail}>
                  <Small muted>{item.stitchingJob.number}</Small>
                  <StageRail
                    stage={item.stitchingJob.stage}
                    events={item.stitchingJob.events}
                    dueAt={item.stitchingJob.dueAt}
                  />
                </View>
              ) : null}
            </View>
          ))}
        </Card>

        <Card>
          <Heading>{t('order.progress')}</Heading>
          {order.statusEvents.map((event, index) => (
            <View key={index} style={styles.event}>
              <Body>{t(`status.${event.toStatus}` as never)}</Body>
              <Small muted>{date(event.createdAt)}</Small>
              {event.note ? <Small muted>{event.note}</Small> : null}
            </View>
          ))}
        </Card>

        <Card>
          <Heading>{t('order.summary')}</Heading>
          <Row label={t('cart.goods')} value={formatMoney(order.itemsSubtotal, locale)} />
          {order.stitchingSubtotal > 0 ? (
            <Row label={t('cart.stitching')} value={formatMoney(order.stitchingSubtotal, locale)} />
          ) : null}
          <Row
            label={t('checkout.shipping')}
            value={
              order.shippingFee === 0 ? t('checkout.free') : formatMoney(order.shippingFee, locale)
            }
          />
          {order.codFee > 0 ? (
            <Row label={t('checkout.codFee')} value={formatMoney(order.codFee, locale)} />
          ) : null}
          <View style={styles.divider} />
          <Row label={t('order.total')} value={formatMoney(order.grandTotal, locale)} strong />
        </Card>

        <Card>
          <Heading>{t('order.deliveringTo')}</Heading>
          <Body muted>{order.shippingAddress.fullName}</Body>
          <Body muted>{order.shippingAddress.line1}</Body>
          <Body muted>
            {order.shippingAddress.city}, {order.shippingAddress.province}
          </Body>
          <Body muted>{order.shippingAddress.phone}</Body>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(4), paddingBottom: theme.space(10) },
  paymentOk: { backgroundColor: theme.color.brandSoft, borderColor: theme.color.brand },
  paymentFailed: { backgroundColor: theme.color.dangerSoft, borderColor: theme.color.danger },
  item: {
    paddingVertical: theme.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.color.line,
  },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.space(3) },
  rail: { marginTop: theme.space(3) },
  event: { paddingVertical: theme.space(2) },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.color.line,
    marginVertical: theme.space(2),
  },
});
