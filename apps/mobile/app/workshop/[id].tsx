import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { nextStage, previousStage } from '@yaseen/shared';
import * as resources from '../../src/api/resources';
import type { WorkshopJob } from '../../src/api/types';
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
  Small,
  Title,
} from '../../src/components/ui';
import { useI18n } from '../../src/i18n';
import { theme } from '../../src/theme';

/**
 * One job, for the tailor working it.
 *
 * Only the two reachable stages are offered, and sending work back needs a
 * reason — the same rules the API enforces, so the buttons never promise
 * something that will be refused.
 */
export default function WorkshopJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale, date } = useI18n();

  const [job, setJob] = useState<WorkshopJob | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setJob(await resources.getJob(id));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('common.offline'));
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function move(toStage: NonNullable<ReturnType<typeof nextStage>>, back: boolean) {
    if (back && !note.trim()) {
      setError(t('workshop.noteRequired'));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      setJob(await resources.changeJobStage(id, toStage, note.trim() || undefined));
      setNote('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('common.somethingWrong'));
    } finally {
      setBusy(false);
    }
  }

  if (!job) {
    return <Screen>{error ? <ErrorNote message={error} /> : <Loading />}</Screen>;
  }

  const forward = nextStage(job.stage);
  const back = previousStage(job.stage);
  const measurements = readMeasurements(job.measurementSnapshot);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Title>{job.number}</Title>
        <Body>
          {locale === 'ur' ? job.garmentType.labelUr : job.garmentType.labelEn} ·{' '}
          {t(`stage.${job.stage}`)}
        </Body>
        {job.dueAt ? <Small muted>{t('workshop.due', { date: date(job.dueAt) })}</Small> : null}

        <Card>
          <Heading>{t('product.measurements')}</Heading>
          {measurements.length === 0 ? (
            <Small muted>—</Small>
          ) : (
            measurements.map(([key, value]) => (
              <Row key={key} label={key.replace(/_/g, ' ')} value={`${value}"`} />
            ))
          )}

          {job.optionsSnapshot?.length ? (
            <View style={styles.options}>
              {job.optionsSnapshot.map((option, index) => (
                <Small key={index} muted>
                  {option.groupLabelEn ? `${option.groupLabelEn}: ` : ''}
                  {option.labelEn}
                </Small>
              ))}
            </View>
          ) : null}

          {job.instructions ? <Body muted>{job.instructions}</Body> : null}
        </Card>

        <Card>
          <Field
            label={t('workshop.note')}
            value={note}
            onChangeText={setNote}
            multiline
          />

          <ErrorNote message={error} />

          {forward ? (
            <Button
              label={t('workshop.moveTo', { stage: t(`stage.${forward}`) })}
              busy={busy}
              onPress={() => void move(forward, false)}
            />
          ) : null}

          {back ? (
            <>
              <View style={styles.gap} />
              <Button
                label={t('workshop.sendBack', { stage: t(`stage.${back}`) })}
                variant="danger"
                disabled={busy || !note.trim()}
                onPress={() => void move(back, true)}
              />
            </>
          ) : null}
        </Card>

        <Card>
          <Heading>{t('workshop.history')}</Heading>
          {job.events.map((event) => (
            <View key={event.id} style={styles.event}>
              <Body>
                {event.fromStage ? `${t(`stage.${event.fromStage}`)} → ` : ''}
                {t(`stage.${event.toStage}`)}
              </Body>
              <Small muted>{date(event.createdAt)}</Small>
              {event.note ? <Small muted>{event.note}</Small> : null}
            </View>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}

/** The snapshot is either `{label, values}` or the values themselves. */
function readMeasurements(
  snapshot: Record<string, unknown> | null,
): Array<[string, number]> {
  if (!snapshot) return [];

  const source =
    snapshot.values && typeof snapshot.values === 'object'
      ? (snapshot.values as Record<string, unknown>)
      : snapshot;

  return Object.entries(source)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .map(([key, value]) => [key, value]);
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(4), paddingBottom: theme.space(10) },
  options: { marginTop: theme.space(2) },
  event: { paddingVertical: theme.space(2) },
  gap: { height: theme.space(2) },
});
