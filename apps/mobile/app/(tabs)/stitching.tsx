import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import * as resources from '../../src/api/resources';
import type { GarmentType, MeasurementProfile } from '../../src/api/types';
import {
  MeasurementFields,
  useMeasurementForm,
} from '../../src/components/measurement-form';
import {
  Body,
  Button,
  Card,
  Chip,
  ErrorNote,
  Field,
  Heading,
  Loading,
  Screen,
  Small,
  Title,
} from '../../src/components/ui';
import { useI18n } from '../../src/i18n';
import { useAuth } from '../../src/state/auth';
import { theme } from '../../src/theme';

/**
 * Booking tailoring on the customer's own cloth, and finding a booking again.
 *
 * One garment per booking from the phone — a second garment is a second
 * booking, which is a fairer trade on a small screen than a form that grows
 * without end. The website takes several at once for anyone who wants that.
 */
export default function StitchingScreen() {
  const { t, locale } = useI18n();
  const { user } = useAuth();

  const [garmentTypes, setGarmentTypes] = useState<GarmentType[] | null>(null);
  const [garmentId, setGarmentId] = useState('');
  const [profiles, setProfiles] = useState<MeasurementProfile[]>([]);
  const [profileId, setProfileId] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [instructions, setInstructions] = useState('');
  const [fabricNotes, setFabricNotes] = useState('');
  const [pickup, setPickup] = useState('');

  const [trackNumber, setTrackNumber] = useState('');
  const [trackPhone, setTrackPhone] = useState('');
  const [trackError, setTrackError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const garment = garmentTypes?.find((candidate) => candidate.id === garmentId);
  const form = useMeasurementForm(garment?.fields ?? []);

  useEffect(() => {
    void resources
      .listGarmentTypes()
      .then((loaded) => {
        setGarmentTypes(loaded);
        setGarmentId(loaded[0]?.id ?? '');
      })
      .catch(() => setGarmentTypes([]));
  }, []);

  useEffect(() => {
    if (!user) return;
    void resources.listProfiles().then(setProfiles).catch(() => undefined);
  }, [user]);

  useEffect(() => {
    if (user) {
      setName((current) => current || [user.firstName, user.lastName].filter(Boolean).join(' '));
      setPhone((current) => current || user.phone || '');
    }
  }, [user]);

  const matchingProfiles = profiles.filter((profile) => profile.garmentTypeId === garmentId);

  async function book() {
    if (!garment) return;

    // Either a saved profile, or numbers typed in and checked here first.
    let measurements: Record<string, number> | undefined;
    if (!profileId) {
      const parsed = form.parse();
      if (!parsed) {
        setError(t('measurements.invalid'));
        return;
      }
      measurements = parsed;
    }

    setBusy(true);
    setError(null);
    try {
      const booking = await resources.bookStitching({
        name,
        phone,
        garments: [
          {
            garmentTypeId: garment.id,
            measurementProfileId: profileId || undefined,
            measurements,
            instructions: instructions || undefined,
          },
        ],
        pickupAddress: pickup ? { line1: pickup } : undefined,
        fabricNotes: fabricNotes || undefined,
      });

      router.push({
        pathname: '/stitching/[number]',
        params: { number: booking.number, phone },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('stitching.bookingFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function track() {
    setTrackError(null);
    try {
      await resources.trackBooking(trackNumber.trim(), trackPhone.trim());
      router.push({
        pathname: '/stitching/[number]',
        params: { number: trackNumber.trim(), phone: trackPhone.trim() },
      });
    } catch {
      setTrackError(t('stitching.trackFailed'));
    }
  }

  if (!garmentTypes) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Title>{t('stitching.bookTitle')}</Title>
        <Body muted>{t('stitching.bookIntro')}</Body>

        <Card>
          <Small muted>{t('stitching.garment')}</Small>
          <View style={styles.chips}>
            {garmentTypes.map((option) => (
              <Chip
                key={option.id}
                label={locale === 'ur' ? option.labelUr : option.labelEn}
                selected={option.id === garmentId}
                onPress={() => {
                  setGarmentId(option.id);
                  setProfileId('');
                }}
              />
            ))}
          </View>

          {matchingProfiles.length > 0 ? (
            <>
              <Small muted>{t('stitching.savedMeasurements')}</Small>
              <View style={styles.chips}>
                <Chip
                  label={t('stitching.typeThemIn')}
                  selected={profileId === ''}
                  onPress={() => setProfileId('')}
                />
                {matchingProfiles.map((profile) => (
                  <Chip
                    key={profile.id}
                    label={profile.label}
                    selected={profile.id === profileId}
                    onPress={() => setProfileId(profile.id)}
                  />
                ))}
              </View>
            </>
          ) : null}

          {!profileId && garment ? (
            <MeasurementFields fields={garment.fields} form={form} />
          ) : null}

          <Field
            label={t('product.notes')}
            value={instructions}
            onChangeText={setInstructions}
            multiline
          />
        </Card>

        <Card>
          <Heading>{t('checkout.name')}</Heading>
          <Field label={t('checkout.name')} value={name} onChangeText={setName} />
          <Field
            label={t('checkout.phone')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="03001234567"
          />
          <Field label={t('stitching.pickup')} value={pickup} onChangeText={setPickup} />
          <Field
            label={t('stitching.fabricNotes')}
            value={fabricNotes}
            onChangeText={setFabricNotes}
            multiline
          />

          <ErrorNote message={error} />
          <Button
            label={t('stitching.book')}
            busy={busy}
            disabled={!name || !phone}
            onPress={() => void book()}
          />
        </Card>

        <Card>
          <Heading>{t('stitching.track')}</Heading>
          <Small muted>{t('stitching.trackHint')}</Small>
          <Field
            label={t('stitching.bookingNumber')}
            value={trackNumber}
            onChangeText={setTrackNumber}
            autoCapitalize="characters"
            placeholder="STO-2026-0001"
          />
          <Field
            label={t('checkout.phone')}
            value={trackPhone}
            onChangeText={setTrackPhone}
            keyboardType="phone-pad"
          />
          <ErrorNote message={trackError} />
          <Button
            label={t('stitching.show')}
            variant="secondary"
            disabled={!trackNumber || !trackPhone}
            onPress={() => void track()}
          />
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(4), paddingBottom: theme.space(10) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2), marginVertical: theme.space(2) },
});
