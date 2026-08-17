import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import * as resources from '../../src/api/resources';
import type { GarmentType, MeasurementProfile } from '../../src/api/types';
import { MeasurementFields, useMeasurementForm } from '../../src/components/measurement-form';
import type { MessageKey } from '../../src/i18n/messages';
import {
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

/**
 * Adding or editing one set of measurements.
 *
 * The fields come from the garment type, which is a table — add "cuff width" in
 * the back office and it appears here on the next launch, with no release.
 */
export default function EditMeasurementsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t, locale } = useI18n();

  const [garmentTypes, setGarmentTypes] = useState<GarmentType[] | null>(null);
  const [existing, setExisting] = useState<MeasurementProfile | null>(null);
  const [garmentId, setGarmentId] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const [types, profiles] = await Promise.all([
        resources.listGarmentTypes(),
        id ? resources.listProfiles() : Promise.resolve([]),
      ]);

      setGarmentTypes(types);

      const found = profiles.find((profile) => profile.id === id) ?? null;
      setExisting(found);
      setGarmentId(found?.garmentTypeId ?? types[0]?.id ?? '');
      setLabel(found?.label ?? '');
      setReady(true);
    })().catch(() => {
      setError(t('common.offline'));
      setReady(true);
    });
  }, [id, t]);

  const garment = garmentTypes?.find((candidate) => candidate.id === garmentId);

  return ready && garmentTypes ? (
    <Form
      key={`${garmentId}-${existing?.id ?? 'new'}`}
      garment={garment}
      garmentTypes={garmentTypes}
      garmentId={garmentId}
      setGarmentId={setGarmentId}
      label={label}
      setLabel={setLabel}
      existing={existing}
      error={error}
      setError={setError}
      busy={busy}
      setBusy={setBusy}
      locale={locale}
      t={t}
    />
  ) : (
    <Screen>
      <Loading />
    </Screen>
  );
}

/**
 * Split out so the measurement form is remounted when the garment changes — its
 * fields, and therefore its state, are a different shape for each garment.
 */
function Form({
  garment,
  garmentTypes,
  garmentId,
  setGarmentId,
  label,
  setLabel,
  existing,
  error,
  setError,
  busy,
  setBusy,
  locale,
  t,
}: {
  garment: GarmentType | undefined;
  garmentTypes: GarmentType[];
  garmentId: string;
  setGarmentId: (id: string) => void;
  label: string;
  setLabel: (label: string) => void;
  existing: MeasurementProfile | null;
  error: string | null;
  setError: (message: string | null) => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  locale: 'en' | 'ur';
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
}) {
  const form = useMeasurementForm(
    garment?.fields ?? [],
    existing?.garmentTypeId === garmentId ? existing.values : {},
  );

  async function save() {
    const values = form.parse();
    if (!values) {
      setError(t('measurements.invalid'));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (existing) {
        await resources.updateProfile(existing.id, { label, values });
      } else {
        await resources.createProfile({ garmentTypeId: garmentId, label, values });
      }
      router.back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('common.somethingWrong'));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;

    setBusy(true);
    try {
      await resources.deleteProfile(existing.id);
      router.back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('common.somethingWrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <Small muted>{t('stitching.garment')}</Small>
          <View style={styles.chips}>
            {garmentTypes.map((option) => (
              <Chip
                key={option.id}
                label={locale === 'ur' ? option.labelUr : option.labelEn}
                selected={option.id === garmentId}
                onPress={() => !existing && setGarmentId(option.id)}
              />
            ))}
          </View>

          <Field
            label={t('measurements.label')}
            placeholder={t('measurements.labelPlaceholder')}
            value={label}
            onChangeText={setLabel}
          />

          {garment ? <MeasurementFields fields={garment.fields} form={form} /> : null}

          <ErrorNote message={error} />

          <Button
            label={t('common.save')}
            busy={busy}
            disabled={!label || !garmentId}
            onPress={() => void save()}
          />

          {existing ? (
            <>
              <View style={styles.gap} />
              <Button
                label={t('cart.remove')}
                variant="danger"
                disabled={busy}
                onPress={() => void remove()}
              />
            </>
          ) : null}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(4), paddingBottom: theme.space(10) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2), marginBottom: theme.space(3) },
  gap: { height: theme.space(2) },
});
