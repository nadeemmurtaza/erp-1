import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { formatMoney } from '@newax/shared';
import * as resources from '../../src/api/resources';
import type { ReturnRequest, ReturnStatus } from '../../src/api/types';
import { Body, Card, Empty, Loading, Screen, Small } from '../../src/components/ui';
import { useI18n } from '../../src/i18n';
import { theme } from '../../src/theme';

const STATUS_KEY: Record<ReturnStatus, string> = {
  REQUESTED: 'returns.statusRequested',
  APPROVED: 'returns.statusApproved',
  REJECTED: 'returns.statusRejected',
  IN_TRANSIT: 'returns.statusInTransit',
  RECEIVED: 'returns.statusReceived',
  INSPECTED: 'returns.statusInspected',
  REFUNDED: 'returns.statusRefunded',
  CLOSED: 'returns.statusClosed',
};

/** WO-6.6 — the customer's own returns, mirroring orders/index.tsx's shape. */
export default function ReturnsScreen() {
  const { t, locale, date } = useI18n();
  const [returns, setReturns] = useState<ReturnRequest[] | null>(null);

  useEffect(() => {
    resources
      .myReturns()
      .then(setReturns)
      .catch(() => setReturns([]));
  }, []);

  if (!returns) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  if (returns.length === 0) {
    return (
      <Screen>
        <Empty message={t('returns.empty')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {returns.map((request) => (
          <Card key={request.id}>
            <View style={styles.head}>
              <Body>{request.number}</Body>
              <Small muted>{t(STATUS_KEY[request.status] as never)}</Small>
            </View>
            <Small muted>
              {request.order.number} · {date(request.requestedAt)}
              {request.refundAmount != null ? ` · ${formatMoney(request.refundAmount, locale)}` : ''}
            </Small>
            {request.customerNote ? <Small muted>{request.customerNote}</Small> : null}
            {request.items.map((item) => (
              <Small key={item.id} muted>
                {(locale === 'ur' && item.orderItem.nameUr ? item.orderItem.nameUr : item.orderItem.nameEn)}
                {item.orderItem.variantLabel ? ` · ${item.orderItem.variantLabel}` : ''} × {item.quantity}
              </Small>
            ))}
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(3), paddingBottom: theme.space(10) },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.space(2) },
});
