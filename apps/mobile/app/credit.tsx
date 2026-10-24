import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatMoney } from '@newax/shared';
import * as resources from '../src/api/resources';
import type { StoreCreditLedgerEntry } from '../src/api/types';
import { Button, Card, Empty, Field, Heading, Loading, Screen, Small } from '../src/components/ui';
import { useI18n } from '../src/i18n';
import { theme } from '../src/theme';

/** WO-7.4 — balance, full history, and redeeming a gift card into the account. */
export default function CreditScreen() {
  const { t, date } = useI18n();

  const [balance, setBalance] = useState<number | null>(null);
  const [ledger, setLedger] = useState<StoreCreditLedgerEntry[]>([]);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(() => {
    resources.storeCreditBalance().then((res) => setBalance(res.balance)).catch(() => undefined);
    resources
      .storeCreditLedger()
      .then((page) => setLedger(page.data))
      .catch(() => undefined);
  }, []);

  useEffect(reload, [reload]);

  async function redeem() {
    setRedeeming(true);
    setMessage(null);
    try {
      await resources.redeemGiftCardIntoAccount(redeemCode);
      setMessage(t('credit.redeemed'));
      setRedeemCode('');
      reload();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : t('credit.redeemFailed'));
    } finally {
      setRedeeming(false);
    }
  }

  if (balance === null) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Heading>{t('credit.balance')}</Heading>
          <Text style={styles.bigNumber}>{formatMoney(balance)}</Text>
        </Card>

        <Card>
          <Heading>{t('credit.redeemGiftCard')}</Heading>
          <Field
            label={t('credit.giftCardCode')}
            value={redeemCode}
            onChangeText={setRedeemCode}
            autoCapitalize="characters"
          />
          <Button
            label={redeeming ? t('credit.redeeming') : t('credit.redeem')}
            busy={redeeming}
            disabled={!redeemCode}
            onPress={() => void redeem()}
          />
          {message ? <Small muted>{message}</Small> : null}
        </Card>

        <Card>
          <Heading>{t('credit.history')}</Heading>
          {ledger.length === 0 ? (
            <Empty message={t('credit.empty')} />
          ) : (
            ledger.map((entry) => (
              <View key={entry.id} style={styles.ledgerRow}>
                <View style={styles.ledgerInfo}>
                  <Small>{entry.note ?? entry.reason}</Small>
                  <Small muted>{date(entry.createdAt)}</Small>
                </View>
                <View style={styles.ledgerAmounts}>
                  <Text style={styles.delta}>{formatMoney(entry.delta)}</Text>
                  <Small muted>{formatMoney(entry.balanceAfter)}</Small>
                </View>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(4), paddingBottom: theme.space(10) },
  bigNumber: { fontSize: 32, fontWeight: '700' as const, color: theme.color.ink },
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.space(3),
    paddingVertical: theme.space(2),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.color.line,
  },
  ledgerInfo: { flex: 1, gap: theme.space(1) },
  ledgerAmounts: { alignItems: 'flex-end', gap: theme.space(1) },
  delta: { ...theme.text.body, fontWeight: '600' as const, color: theme.color.ink },
});
