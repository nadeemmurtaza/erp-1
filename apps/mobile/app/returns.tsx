import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { formatMoney } from '@newax/shared';
import * as resources from '../src/api/resources';
import type { Order, ReturnReasonCode, ReturnRequest, ReturnStatus } from '../src/api/types';
import {
  Body,
  Button,
  Card,
  Chip,
  Empty,
  ErrorNote,
  Field,
  Heading,
  Loading,
  Screen,
  Small,
} from '../src/components/ui';
import { useI18n } from '../src/i18n';
import { theme } from '../src/theme';

const REASON_CODES: ReturnReasonCode[] = [
  'DEFECTIVE',
  'WRONG_ITEM',
  'DAMAGED_IN_TRANSIT',
  'SIZE_FIT_ISSUE',
  'CHANGED_MIND',
  'OTHER',
];

const REASON_LABEL_KEY = {
  DEFECTIVE: 'returns.reasonDefective',
  WRONG_ITEM: 'returns.reasonWrongItem',
  DAMAGED_IN_TRANSIT: 'returns.reasonDamagedInTransit',
  SIZE_FIT_ISSUE: 'returns.reasonSizeFitIssue',
  CHANGED_MIND: 'returns.reasonChangedMind',
  OTHER: 'returns.reasonOther',
} as const;

const STATUS_LABEL_KEY: Record<ReturnStatus, string> = {
  REQUESTED: 'returns.statusRequested',
  APPROVED: 'returns.statusApproved',
  REJECTED: 'returns.statusRejected',
  REFUNDED: 'returns.statusRefunded',
};

/** WO-7.3 — a return end to end without contacting the shop. */
export default function ReturnsScreen() {
  const { order: preselectedOrder } = useLocalSearchParams<{ order?: string }>();
  const { t, date } = useI18n();

  const [requests, setRequests] = useState<ReturnRequest[] | null>(null);
  const [deliveredOrders, setDeliveredOrders] = useState<Order[]>([]);
  const [showForm, setShowForm] = useState(Boolean(preselectedOrder));
  const [selectedOrder, setSelectedOrder] = useState(preselectedOrder ?? '');
  const [eligibility, setEligibility] = useState<{ eligible: boolean; reason?: string } | null>(null);
  const [orderItems, setOrderItems] = useState<Order['items']>([]);
  const [selectedLines, setSelectedLines] = useState<Record<string, number>>({});
  const [reasonCode, setReasonCode] = useState<ReturnReasonCode>('DEFECTIVE');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    resources
      .myReturns()
      .then(setRequests)
      .catch(() => setRequests([]));
  }, []);

  useEffect(() => {
    load();
    resources
      .myOrders()
      .then((page) => setDeliveredOrders(page.data.filter((order) => order.status === 'DELIVERED')))
      .catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (!selectedOrder) {
      setEligibility(null);
      setOrderItems([]);
      return;
    }
    resources.returnEligibility(selectedOrder).then(setEligibility).catch(() => setEligibility(null));
    resources
      .getOrder(selectedOrder)
      .then((order) => setOrderItems(order.items))
      .catch(() => setOrderItems([]));
  }, [selectedOrder]);

  async function submit() {
    const lines = Object.entries(selectedLines)
      .filter(([, quantity]) => quantity > 0)
      .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));

    if (lines.length === 0) {
      setMessage(t('returns.selectLines'));
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      await resources.createReturn({ orderNumber: selectedOrder, lines, reasonCode, note: note || undefined });
      setMessage(t('returns.submitted'));
      setShowForm(false);
      setSelectedOrder('');
      setSelectedLines({});
      setNote('');
      load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : t('returns.failed'));
    } finally {
      setSubmitting(false);
    }
  }

  function changeQuantity(itemId: string, max: number, delta: number) {
    setSelectedLines((current) => {
      const next = Math.max(0, Math.min(max, (current[itemId] ?? 0) + delta));
      return { ...current, [itemId]: next };
    });
  }

  if (!requests) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {!showForm ? (
          <Button label={t('returns.newRequest')} onPress={() => setShowForm(true)} />
        ) : (
          <Card>
            <Heading>{t('returns.newRequest')}</Heading>

            <Small muted>{t('returns.selectOrder')}</Small>
            {deliveredOrders.length === 0 ? (
              <Small muted>{t('returns.noEligibleOrders')}</Small>
            ) : (
              <View style={styles.chips}>
                {deliveredOrders.map((order) => (
                  <Chip
                    key={order.number}
                    label={order.number}
                    selected={order.number === selectedOrder}
                    onPress={() => {
                      setSelectedOrder(order.number);
                      setSelectedLines({});
                    }}
                  />
                ))}
              </View>
            )}

            {eligibility && !eligibility.eligible ? (
              <ErrorNote message={t('returns.notEligible', { reason: eligibility.reason ?? '' })} />
            ) : null}

            {eligibility?.eligible && orderItems.length > 0 ? (
              <View style={styles.section}>
                <Small muted>{t('returns.selectLines')}</Small>
                {orderItems
                  .filter((item) => !item.stitchingServiceName)
                  .map((item) => (
                    <View key={item.id} style={styles.line}>
                      <View style={styles.lineInfo}>
                        <Body>{item.nameEn}</Body>
                        <Small muted>{formatMoney(item.lineTotal)}</Small>
                      </View>
                      <View style={styles.stepper}>
                        <Button
                          label="−"
                          variant="secondary"
                          onPress={() => changeQuantity(item.id, item.quantity, -1)}
                        />
                        <Body>{selectedLines[item.id] ?? 0}</Body>
                        <Button
                          label="+"
                          variant="secondary"
                          onPress={() => changeQuantity(item.id, item.quantity, 1)}
                        />
                      </View>
                    </View>
                  ))}
              </View>
            ) : null}

            <View style={styles.section}>
              <Small muted>{t('returns.reason')}</Small>
              <View style={styles.chips}>
                {REASON_CODES.map((code) => (
                  <Chip
                    key={code}
                    label={t(REASON_LABEL_KEY[code] as never)}
                    selected={reasonCode === code}
                    onPress={() => setReasonCode(code)}
                  />
                ))}
              </View>
            </View>

            <Field label={t('returns.note')} value={note} onChangeText={setNote} multiline />

            {message ? <Small muted>{message}</Small> : null}

            <View style={styles.formActions}>
              <Button
                label={t('returns.submit')}
                busy={submitting}
                disabled={!eligibility?.eligible}
                onPress={() => void submit()}
              />
              <Button label={t('common.cancel')} variant="quiet" onPress={() => setShowForm(false)} />
            </View>
          </Card>
        )}

        {requests.length === 0 ? (
          <Empty message={t('returns.empty')} />
        ) : (
          requests.map((request) => (
            <Card key={request.id}>
              <View style={styles.head}>
                <Body>{request.order.number}</Body>
                <Small muted>{t(STATUS_LABEL_KEY[request.status] as never)}</Small>
              </View>
              <Small muted>{t('returns.requestedOn', { date: date(request.createdAt) })}</Small>
              {request.decisionNote ? (
                <Small muted>
                  {t('returns.decisionNote')}: {request.decisionNote}
                </Small>
              ) : null}
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(3), paddingBottom: theme.space(10) },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.space(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2), marginTop: theme.space(2) },
  section: { marginTop: theme.space(3), gap: theme.space(2) },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space(3),
    paddingVertical: theme.space(2),
  },
  lineInfo: { flex: 1, gap: theme.space(1) },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: theme.space(2) },
  formActions: { marginTop: theme.space(3), gap: theme.space(2) },
});
