import { router } from 'expo-router';
import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatMoney } from '@newax/shared';
import {
  Body,
  Button,
  Card,
  Empty,
  ErrorNote,
  Loading,
  Row,
  Screen,
  Small,
  Title,
} from '../../src/components/ui';
import { useI18n } from '../../src/i18n';
import { useCart } from '../../src/state/cart';
import { theme } from '../../src/theme';

/** What is in the cart, priced by the API on every read. */
export default function CartScreen() {
  const { t, locale } = useI18n();
  const { cart, loading, setQuantity, remove } = useCart();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function change(itemId: string, quantity: number) {
    setBusy(itemId);
    setError(null);
    try {
      await setQuantity(itemId, quantity);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('common.somethingWrong'));
    } finally {
      setBusy(null);
    }
  }

  if (loading && !cart) return <Screen><Loading /></Screen>;

  if (!cart || cart.items.length === 0) {
    return (
      <Screen>
        <Empty
          message={t('cart.empty')}
          action={
            <Button
              label={t('cart.goShopping')}
              variant="secondary"
              onPress={() => router.push('/')}
            />
          }
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>{t('cart.title')}</Title>
        <ErrorNote message={error} />

        {cart.items.map((item) => (
          <Card key={item.id}>
            <View style={styles.line}>
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]} />
              )}

              <View style={styles.lineBody}>
                <Body>{item.name}</Body>
                {item.variantLabel ? <Small muted>{item.variantLabel}</Small> : null}

                {item.stitching ? (
                  <View style={styles.stitching}>
                    <Small>{item.stitching.serviceName}</Small>
                    {item.stitching.options.length > 0 ? (
                      <Small muted>
                        {item.stitching.options
                          .map((option) => `${option.groupLabel}: ${option.label}`)
                          .join(' · ')}
                      </Small>
                    ) : null}
                    {item.stitching.measurementProfileLabel ? (
                      <Small muted>{item.stitching.measurementProfileLabel}</Small>
                    ) : null}
                  </View>
                ) : null}

                {item.exceedsStock ? (
                  <Text style={styles.warning}>
                    ⚠ {t('product.outOfStock')} ({item.availableStock})
                  </Text>
                ) : null}

                <View style={styles.controls}>
                  <Button
                    label="−"
                    variant="secondary"
                    disabled={busy === item.id}
                    onPress={() => void change(item.id, item.quantity - 1)}
                  />
                  <Text style={styles.quantity}>{item.quantity}</Text>
                  <Button
                    label="+"
                    variant="secondary"
                    disabled={busy === item.id || item.quantity >= item.availableStock}
                    onPress={() => void change(item.id, item.quantity + 1)}
                  />
                  <View style={styles.spacer} />
                  <Text style={styles.lineTotal}>{formatMoney(item.lineTotal, locale)}</Text>
                </View>

                <Button
                  label={t('cart.remove')}
                  variant="quiet"
                  disabled={busy === item.id}
                  onPress={() => void remove(item.id).catch(() => setError(t('common.somethingWrong')))}
                />
              </View>
            </View>
          </Card>
        ))}

        <Card>
          <Row label={t('cart.goods')} value={formatMoney(cart.totals.itemsSubtotal, locale)} />
          {cart.totals.stitchingSubtotal > 0 ? (
            <Row
              label={t('cart.stitching')}
              value={formatMoney(cart.totals.stitchingSubtotal, locale)}
            />
          ) : null}
          <View style={styles.divider} />
          <Row label={t('cart.total')} value={formatMoney(cart.totals.grandTotal, locale)} strong />
        </Card>

        {cart.issues.length > 0 ? (
          <ErrorNote message={cart.issues.join('\n')} />
        ) : null}

        <Button
          label={t('cart.checkout')}
          onPress={() => router.push('/checkout')}
          disabled={cart.issues.length > 0}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(4), paddingBottom: theme.space(10) },
  line: { flexDirection: 'row', gap: theme.space(3) },
  thumb: { width: 64, height: 84, borderRadius: theme.radius.sm },
  thumbEmpty: { backgroundColor: theme.color.sandDeep },
  lineBody: { flex: 1, gap: theme.space(1) },
  stitching: {
    backgroundColor: theme.color.brandSoft,
    borderRadius: theme.radius.sm,
    padding: theme.space(2),
    marginTop: theme.space(1),
  },
  warning: { ...theme.text.small, color: theme.color.danger },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(2),
    marginTop: theme.space(2),
  },
  quantity: { ...theme.text.body, minWidth: 24, textAlign: 'center', color: theme.color.ink },
  spacer: { flex: 1 },
  lineTotal: { ...theme.text.body, fontWeight: '600', color: theme.color.ink },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.color.line,
    marginVertical: theme.space(2),
  },
});
