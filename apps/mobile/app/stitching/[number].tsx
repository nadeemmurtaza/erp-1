import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { formatMoney } from '@newax/shared';
import * as resources from '../../src/api/resources';
import type { Booking } from '../../src/api/types';
import { StageRail } from '../../src/components/stage-rail';
import {
  Body,
  Button,
  Card,
  ErrorNote,
  Field,
  Heading,
  Loading,
  Row,
  Screen,
  Screen as Wrapper,
  Small,
  Title,
} from '../../src/components/ui';
import { useI18n } from '../../src/i18n';
import { theme } from '../../src/theme';

/**
 * One booking, garment by garment.
 *
 * The phone number travels as a route param from the screen that just used it,
 * so a customer who has only this second booked something is not asked to prove
 * who they are. Anyone arriving cold gets the form.
 */
export default function BookingScreen() {
  const { number, phone: initialPhone } = useLocalSearchParams<{
    number: string;
    phone?: string;
  }>();
  const { t, locale, date } = useI18n();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(initialPhone));
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (withPhone: string) => {
      try {
        setBooking(await resources.trackBooking(number, withPhone));
        setError(null);
        return true;
      } catch {
        setError(t('stitching.trackFailed'));
        return false;
      }
    },
    [number, t],
  );

  useEffect(() => {
    if (!initialPhone) return;
    void load(initialPhone).finally(() => setLoading(false));
  }, [initialPhone, load]);

  if (loading) return <Wrapper><Loading /></Wrapper>;

  if (!booking) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.content}>
          <Title>{t('stitching.track')}</Title>
          <Card>
            <Field
              label={t('checkout.phone')}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="03001234567"
            />
            <ErrorNote message={error} />
            <Button
              label={t('stitching.show')}
              disabled={!phone}
              onPress={() => void load(phone)}
            />
          </Card>
        </ScrollView>
      </Screen>
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
              void load(phone || (initialPhone ?? '')).finally(() => setRefreshing(false));
            }}
          />
        }
      >
        <Title>{booking.number}</Title>

        <Card>
          <Row
            label={t('stitching.fabricNotes')}
            value={booking.fabricNotes ?? '—'}
          />
          <Body muted>
            {booking.fabricReceivedAt
              ? t('stitching.fabricReceived', { date: date(booking.fabricReceivedAt) })
              : t('stitching.fabricAwaited')}
          </Body>
          {booking.quotedFee !== null ? (
            <Row
              label={t('stitching.quote')}
              value={formatMoney(booking.quotedFee, locale)}
              strong
            />
          ) : null}
        </Card>

        {booking.jobs.map((job) => (
          <Card key={job.id}>
            <Heading>
              {locale === 'ur' ? job.garmentType.labelUr : job.garmentType.labelEn}
            </Heading>
            <Small muted>{job.number}</Small>
            {job.instructions ? <Body muted>{job.instructions}</Body> : null}

            <StageRail stage={job.stage} events={job.events} dueAt={job.dueAt} />
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(4), paddingBottom: theme.space(10) },
});
