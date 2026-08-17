import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import * as resources from '../../src/api/resources';
import type { MeasurementProfile } from '../../src/api/types';
import {
  Body,
  Button,
  Card,
  Empty,
  ErrorNote,
  Loading,
  Screen,
  Small,
} from '../../src/components/ui';
import { useI18n } from '../../src/i18n';
import { theme } from '../../src/theme';

/** The customer's saved measurements, one card per garment and person. */
export default function MeasurementsScreen() {
  const { t, locale } = useI18n();
  const [profiles, setProfiles] = useState<MeasurementProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setProfiles(await resources.listProfiles());
      setError(null);
    } catch {
      setError(t('common.offline'));
      setProfiles([]);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!profiles) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <ErrorNote message={error} />

        {profiles.length === 0 ? (
          <Empty
            message={t('measurements.empty')}
            action={
              <Button
                label={t('measurements.add')}
                onPress={() => router.push('/measurements/edit')}
              />
            }
          />
        ) : (
          <>
            {profiles.map((profile) => (
              <Pressable
                key={profile.id}
                accessibilityRole="button"
                onPress={() =>
                  router.push({ pathname: '/measurements/edit', params: { id: profile.id } })
                }
              >
                <Card>
                  <Body>{profile.label}</Body>
                  <Small muted>
                    {locale === 'ur'
                      ? profile.garmentType.labelUr
                      : profile.garmentType.labelEn}
                  </Small>
                  <Small muted>
                    {Object.entries(profile.values)
                      .map(([key, value]) => `${key.replace(/_/g, ' ')} ${value}`)
                      .join(' · ')}
                  </Small>
                </Card>
              </Pressable>
            ))}

            <Button
              label={t('measurements.add')}
              variant="secondary"
              onPress={() => router.push('/measurements/edit')}
            />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(3), paddingBottom: theme.space(10) },
});
