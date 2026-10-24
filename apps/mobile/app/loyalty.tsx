import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatMoney } from '@newax/shared';
import * as resources from '../src/api/resources';
import type { LoyaltyBalance, LoyaltyLedgerEntry, Referral } from '../src/api/types';
import { Body, Button, Card, Empty, Field, Heading, Loading, Screen, Small } from '../src/components/ui';
import { useI18n } from '../src/i18n';
import { theme } from '../src/theme';

/** WO-7.7 — points, tiers, redemption, and referrals. */
export default function LoyaltyScreen() {
  const { t, date } = useI18n();

  const [balance, setBalance] = useState<LoyaltyBalance | null>(null);
  const [ledger, setLedger] = useState<LoyaltyLedgerEntry[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [code, setCode] = useState<string | null>(null);

  const [redeemPoints, setRedeemPoints] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMessage, setRedeemMessage] = useState<string | null>(null);

  const [applyCode, setApplyCode] = useState('');
  const [applyMessage, setApplyMessage] = useState<string | null>(null);

  const reload = useCallback(() => {
    resources.loyaltyBalance().then(setBalance).catch(() => undefined);
    resources
      .loyaltyLedger()
      .then((page) => setLedger(page.data))
      .catch(() => undefined);
    resources.myReferrals().then(setReferrals).catch(() => undefined);
  }, []);

  useEffect(reload, [reload]);

  async function redeem() {
    setRedeeming(true);
    setRedeemMessage(null);
    try {
      await resources.redeemLoyaltyPoints(Number(redeemPoints));
      setRedeemMessage(t('loyalty.redeemed'));
      setRedeemPoints('');
      reload();
    } catch (cause) {
      setRedeemMessage(cause instanceof Error ? cause.message : t('loyalty.redeemFailed'));
    } finally {
      setRedeeming(false);
    }
  }

  async function getCode() {
    const result = await resources.myReferralCode();
    setCode(result.code);
  }

  async function applyCodeSubmit() {
    setApplyMessage(null);
    try {
      await resources.applyReferralCode(applyCode);
      setApplyMessage(t('loyalty.applied'));
      setApplyCode('');
    } catch (cause) {
      setApplyMessage(cause instanceof Error ? cause.message : t('loyalty.applyFailed'));
    }
  }

  if (!balance) {
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
          <Heading>{t('loyalty.points')}</Heading>
          <Text style={styles.bigNumber}>{balance.points}</Text>
          <Small muted>{t('loyalty.tier')}: {balance.tier?.name ?? t('loyalty.noTier')}</Small>
          <Small muted>{t('loyalty.trailingSpend')}: {formatMoney(balance.trailing12MonthSpend)}</Small>
        </Card>

        <Card>
          <Heading>{t('loyalty.redeem')}</Heading>
          <Field
            label={t('loyalty.redeemAmount')}
            value={redeemPoints}
            onChangeText={setRedeemPoints}
            keyboardType="number-pad"
          />
          <Button
            label={t('loyalty.redeemSubmit')}
            busy={redeeming}
            disabled={!redeemPoints}
            onPress={() => void redeem()}
          />
          {redeemMessage ? <Small muted>{redeemMessage}</Small> : null}
        </Card>

        <Card>
          <Heading>{t('loyalty.referralTitle')}</Heading>
          <Small muted>{t('loyalty.referralBody')}</Small>

          {code ? (
            <Text style={styles.code}>{code}</Text>
          ) : (
            <Button label={t('loyalty.getCode')} variant="secondary" onPress={() => void getCode()} />
          )}

          {referrals.length > 0 ? (
            <Small muted>
              {t('loyalty.myReferrals')}: {referrals.length} ({referrals.filter((r) => r.rewardedAt).length})
            </Small>
          ) : null}

          <View style={styles.applyForm}>
            <Field
              label={t('loyalty.applyCode')}
              placeholder={t('loyalty.applyCodePlaceholder')}
              value={applyCode}
              onChangeText={setApplyCode}
              autoCapitalize="characters"
            />
            <Button
              label={t('loyalty.apply')}
              variant="secondary"
              disabled={!applyCode}
              onPress={() => void applyCodeSubmit()}
            />
          </View>
          {applyMessage ? <Small muted>{applyMessage}</Small> : null}
        </Card>

        <Card>
          <Heading>{t('loyalty.history')}</Heading>
          {ledger.length === 0 ? (
            <Empty message={t('loyalty.empty')} />
          ) : (
            ledger.map((entry) => (
              <View key={entry.id} style={styles.ledgerRow}>
                <View style={styles.ledgerInfo}>
                  <Small>{entry.note ?? entry.type}</Small>
                  <Small muted>{date(entry.createdAt)}</Small>
                </View>
                <Body>{entry.points}</Body>
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
  code: {
    ...theme.text.heading,
    fontWeight: '700' as const,
    color: theme.color.ink,
    marginTop: theme.space(2),
    letterSpacing: 1,
  },
  applyForm: { marginTop: theme.space(3), gap: theme.space(2) },
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.space(3),
    paddingVertical: theme.space(2),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.color.line,
  },
  ledgerInfo: { flex: 1, gap: theme.space(1) },
});
