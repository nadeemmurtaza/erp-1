import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import * as resources from '../../src/api/resources';
import type { Order, ReturnReason } from '../../src/api/types';
import {
  Body,
  Button,
  Card,
  Chip,
  ErrorNote,
  Field,
  Loading,
  Screen,
  Small,
} from '../../src/components/ui';
import { useI18n } from '../../src/i18n';
import { theme } from '../../src/theme';

interface LineState {
  selected: boolean;
  quantity: number;
  reasonId: string;
}

/** WO-6.6 — the customer's own side of the return-item portal, reached from the order screen. */
export default function NewReturnRequestScreen() {
  const { number } = useLocalSearchParams<{ number: string }>();
  const { t, locale } = useI18n();

  const [order, setOrder] = useState<Order | null>(null);
  const [reasons, setReasons] = useState<ReturnReason[] | null>(null);
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!number) return;
    Promise.all([resources.getOrder(number), resources.listReturnReasons()])
      .then(([loadedOrder, loadedReasons]) => {
        setOrder(loadedOrder);
        setReasons(loadedReasons);
        setLines(
          Object.fromEntries(
            loadedOrder.items.map((item) => [
              item.id,
              { selected: false, quantity: item.quantity, reasonId: loadedReasons[0]?.id ?? '' },
            ]),
          ),
        );
      })
      .catch(() => setError(t('common.offline')));
  }, [number, t]);

  function toggleLine(itemId: string) {
    setLines((current) => ({ ...current, [itemId]: { ...current[itemId]!, selected: !current[itemId]!.selected } }));
  }

  function changeQuantity(itemId: string, max: number, delta: number) {
    setLines((current) => {
      const line = current[itemId]!;
      const quantity = Math.max(1, Math.min(max, line.quantity + delta));
      return { ...current, [itemId]: { ...line, quantity } };
    });
  }

  function setReason(itemId: string, reasonId: string) {
    setLines((current) => ({ ...current, [itemId]: { ...current[itemId]!, reasonId } }));
  }

  async function submit() {
    if (!order) return;
    const items = Object.entries(lines)
      .filter(([, line]) => line.selected)
      .map(([orderItemId, line]) => ({ orderItemId, reasonId: line.reasonId, quantity: line.quantity }));

    if (items.length === 0) {
      setError(t('returns.selectItems'));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await resources.createReturn({ orderNumber: order.number, customerNote: note || undefined, items });
      router.replace('/returns');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('returns.failed'));
      setSubmitting(false);
    }
  }

  if (!order || !reasons) {
    return <Screen>{error ? <ErrorNote message={error} /> : <Loading />}</Screen>;
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Small muted>{order.number}</Small>
        <Small muted>{t('returns.selectItems')}</Small>

        {order.items.map((item) => {
          const line = lines[item.id];
          if (!line) return null;
          const name = (locale === 'ur' && item.nameUr ? item.nameUr : item.nameEn) || item.nameEn;

          return (
            <Card key={item.id}>
              <Button
                label={name + (item.variantLabel ? ` · ${item.variantLabel}` : '')}
                variant={line.selected ? 'primary' : 'secondary'}
                onPress={() => toggleLine(item.id)}
              />

              {line.selected ? (
                <View style={styles.lineDetail}>
                  <View style={styles.stepper}>
                    <Small muted>{t('returns.quantity')}</Small>
                    <Button label="−" variant="quiet" onPress={() => changeQuantity(item.id, item.quantity, -1)} />
                    <Body>{line.quantity}</Body>
                    <Button label="+" variant="quiet" onPress={() => changeQuantity(item.id, item.quantity, 1)} />
                  </View>

                  <Small muted>{t('returns.reason')}</Small>
                  <View style={styles.chips}>
                    {reasons.map((reason) => (
                      <Chip
                        key={reason.id}
                        label={
                          reason.translations.find((tr) => tr.locale === locale)?.label ??
                          reason.translations[0]?.label ??
                          reason.key
                        }
                        selected={line.reasonId === reason.id}
                        onPress={() => setReason(item.id, reason.id)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
            </Card>
          );
        })}

        <Field label={t('returns.note')} value={note} onChangeText={setNote} multiline />

        <ErrorNote message={error} />

        <Button label={t('returns.submit')} busy={submitting} onPress={() => void submit()} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(3), paddingBottom: theme.space(10) },
  lineDetail: { marginTop: theme.space(3), gap: theme.space(2) },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: theme.space(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2) },
});
