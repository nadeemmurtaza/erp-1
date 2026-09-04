import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { formatMoney } from '@yaseen/shared';
import * as resources from '../src/api/resources';
import type { Order, PaymentMethod } from '../src/api/types';
import {
  Body,
  Button,
  Card,
  Chip,
  ErrorNote,
  Field,
  Heading,
  Row,
  Screen,
  Small,
} from '../src/components/ui';
import { useI18n } from '../src/i18n';
import { useAuth } from '../src/state/auth';
import { useCart } from '../src/state/cart';
import { theme } from '../src/theme';

const PROVINCES = ['Punjab', 'Sindh', 'KPK', 'Balochistan', 'Islamabad', 'AJK', 'GB'];

/**
 * Address, payment method, done.
 *
 * The delivery charge depends on the city and is added by the API when the
 * order is written, so the app shows the goods total and says plainly that
 * delivery is added — rather than guessing a figure and being wrong.
 */
export default function CheckoutScreen() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { cart, refresh } = useCart();

  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [method, setMethod] = useState('cod');
  const [address, setAddress] = useState({
    fullName: '',
    phone: '',
    line1: '',
    line2: '',
    city: '',
    province: 'Punjab',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<Order | null>(null);

  useEffect(() => {
    void resources
      .paymentMethods()
      .then((loaded) => {
        setMethods(loaded);
        if (loaded[0]) setMethod(loaded[0].key);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (user) {
      setAddress((current) => ({
        ...current,
        fullName:
          current.fullName || [user.firstName, user.lastName].filter(Boolean).join(' '),
        phone: current.phone || user.phone || '',
      }));
    }
  }, [user]);

  async function place() {
    setBusy(true);
    setError(null);
    try {
      const order = await resources.placeOrder({
        shippingAddress: {
          ...address,
          line2: address.line2 || undefined,
        },
        paymentMethod: method,
      });

      await refresh();

      const payment = order.payments[0];
      if (payment?.redirectUrl && payment.meta?.fields) {
        router.push({
          pathname: '/payment',
          params: {
            redirectUrl: payment.redirectUrl,
            fields: JSON.stringify(payment.meta.fields),
            orderNumber: order.number,
          },
        });
        return;
      }

      setPlaced(order);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('common.somethingWrong'));
    } finally {
      setBusy(false);
    }
  }

  async function attachReceipt(paymentId: string) {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (picked.canceled || !picked.assets[0]) return;

    const asset = picked.assets[0];
    setBusy(true);
    setError(null);
    try {
      await resources.uploadReceipt(paymentId, {
        uri: asset.uri,
        name: asset.fileName ?? 'receipt.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      });
      setPlaced((current) =>
        current
          ? {
              ...current,
              payments: current.payments.map((payment) =>
                payment.id === paymentId ? { ...payment, status: 'AWAITING_APPROVAL' } : payment,
              ),
            }
          : current,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('common.somethingWrong'));
    } finally {
      setBusy(false);
    }
  }

  if (placed) {
    const bankPayment = placed.payments.find((payment) => payment.provider === 'bank_transfer');
    const accounts = bankPayment?.meta?.accounts ?? [];

    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.content}>
          <Card>
            <Heading>{t('order.thanks')}</Heading>
            <Body muted>{placed.number}</Body>
          </Card>

          {bankPayment ? (
            <Card>
              <Heading>{t('checkout.receipt')}</Heading>
              {accounts.map((account) => (
                <View key={account.iban} style={styles.account}>
                  <Small>{account.bank}</Small>
                  <Small muted>{account.title}</Small>
                  <Small muted>{account.accountNumber}</Small>
                  <Small muted>{account.iban}</Small>
                </View>
              ))}
              {bankPayment.status === 'AWAITING_APPROVAL' ? (
                <Body muted>{t('checkout.receiptSent')}</Body>
              ) : (
                <Button
                  label={t('checkout.receiptChoose')}
                  variant="secondary"
                  busy={busy}
                  onPress={() => void attachReceipt(bankPayment.id)}
                />
              )}
            </Card>
          ) : null}

          <ErrorNote message={error} />

          <Button
            label={t('orders.title')}
            onPress={() => router.replace(`/orders/${placed.number}`)}
          />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Heading>{t('order.deliveringTo')}</Heading>
          <Field
            label={t('checkout.name')}
            value={address.fullName}
            autoComplete="name"
            onChangeText={(text) => setAddress((current) => ({ ...current, fullName: text }))}
          />
          <Field
            label={t('checkout.phone')}
            value={address.phone}
            keyboardType="phone-pad"
            autoComplete="tel"
            placeholder="03001234567"
            onChangeText={(text) => setAddress((current) => ({ ...current, phone: text }))}
          />
          <Field
            label={t('checkout.line1')}
            value={address.line1}
            onChangeText={(text) => setAddress((current) => ({ ...current, line1: text }))}
          />
          <Field
            label={t('checkout.line2')}
            value={address.line2}
            onChangeText={(text) => setAddress((current) => ({ ...current, line2: text }))}
          />
          <Field
            label={t('checkout.city')}
            value={address.city}
            onChangeText={(text) => setAddress((current) => ({ ...current, city: text }))}
          />

          <Small muted>{t('checkout.province')}</Small>
          <View style={styles.chips}>
            {PROVINCES.map((province) => (
              <Chip
                key={province}
                label={province}
                selected={address.province === province}
                onPress={() => setAddress((current) => ({ ...current, province }))}
              />
            ))}
          </View>
        </Card>

        <Card>
          <Heading>{t('checkout.payment')}</Heading>
          <View style={styles.chips}>
            {methods.map((option) => (
              <Chip
                key={option.key}
                label={locale === 'ur' ? option.labelUr : option.labelEn}
                selected={method === option.key}
                onPress={() => setMethod(option.key)}
              />
            ))}
          </View>
          {methods
            .filter((option) => option.key === method && option.fee > 0)
            .map((option) => (
              <Small key={option.key} muted>
                {t('checkout.codFee')}: {formatMoney(option.fee, locale)}
              </Small>
            ))}
        </Card>

        {cart ? (
          <Card>
            <Row label={t('cart.goods')} value={formatMoney(cart.totals.itemsSubtotal, locale)} />
            {cart.totals.stitchingSubtotal > 0 ? (
              <Row
                label={t('cart.stitching')}
                value={formatMoney(cart.totals.stitchingSubtotal, locale)}
              />
            ) : null}
            <Row label={t('checkout.shipping')} value="—" />
            <View style={styles.divider} />
            <Row
              label={t('cart.total')}
              value={formatMoney(cart.totals.grandTotal, locale)}
              strong
            />
          </Card>
        ) : null}

        <ErrorNote message={error} />

        <Button
          label={busy ? t('checkout.placing') : t('checkout.place')}
          busy={busy}
          onPress={() => void place()}
          disabled={!address.fullName || !address.phone || !address.line1 || !address.city}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(4), paddingBottom: theme.space(10) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2), marginTop: theme.space(2) },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.color.line,
    marginVertical: theme.space(2),
  },
  account: { marginVertical: theme.space(2) },
});
