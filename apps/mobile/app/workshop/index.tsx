import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as resources from '../../src/api/resources';
import type { WorkshopJob } from '../../src/api/types';
import {
  Body,
  Card,
  Empty,
  ErrorNote,
  Loading,
  Screen,
  Small,
} from '../../src/components/ui';
import { useI18n } from '../../src/i18n';
import { theme } from '../../src/theme';

/**
 * A tailor's queue, in their pocket.
 *
 * The same list the back office shows, filtered to their own work by default —
 * that is what a tailor standing at a machine actually wants.
 */
export default function WorkshopScreen() {
  const { t, date } = useI18n();

  const [jobs, setJobs] = useState<WorkshopJob[] | null>(null);
  const [mine, setMine] = useState(true);
  const [overdue, setOverdue] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setJobs(await resources.listJobs({ mine, overdue }));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('common.offline'));
      setJobs([]);
    }
  }, [mine, overdue, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen>
      <View style={styles.filters}>
        <View style={styles.filter}>
          <Small>{t('workshop.mine')}</Small>
          <Switch
            value={mine}
            onValueChange={setMine}
            accessibilityLabel={t('workshop.mine')}
            trackColor={{ true: theme.color.brand, false: theme.color.sandDeep }}
          />
        </View>
        <View style={styles.filter}>
          <Small>{t('workshop.overdue')}</Small>
          <Switch
            value={overdue}
            onValueChange={setOverdue}
            accessibilityLabel={t('workshop.overdue')}
            trackColor={{ true: theme.color.brand, false: theme.color.sandDeep }}
          />
        </View>
      </View>

      <ErrorNote message={error} />

      {!jobs ? (
        <Loading />
      ) : jobs.length === 0 ? (
        <Empty message={t('workshop.empty')} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load().finally(() => setRefreshing(false));
              }}
            />
          }
        >
          {jobs.map((job) => {
            const late =
              job.dueAt !== null &&
              job.stage !== 'READY' &&
              job.stage !== 'DISPATCHED' &&
              new Date(job.dueAt).getTime() < Date.now();

            const customer =
              job.orderItem?.order.guestName ?? job.stitchingOrder?.guestName ?? '';
            const reference = job.orderItem?.order.number ?? job.stitchingOrder?.number ?? '';

            return (
              <Link key={job.id} href={`/workshop/${job.id}`} asChild>
                <Pressable accessibilityRole="button">
                  <Card>
                    <View style={styles.head}>
                      <Body>{job.number}</Body>
                      <Text style={styles.stage}>{t(`stage.${job.stage}`)}</Text>
                    </View>
                    <Small muted>
                      {job.garmentType.labelEn}
                      {customer ? ` · ${customer}` : ''}
                      {reference ? ` · ${reference}` : ''}
                    </Small>
                    {job.dueAt ? (
                      <Small muted={!late}>
                        {t('workshop.due', { date: date(job.dueAt) })}
                        {/* The word, not just the colour. */}
                        {late ? `  ${t('workshop.overdue')}` : ''}
                      </Small>
                    ) : null}
                  </Card>
                </Pressable>
              </Link>
            );
          })}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: {
    flexDirection: 'row',
    gap: theme.space(6),
    padding: theme.space(4),
  },
  filter: { flexDirection: 'row', alignItems: 'center', gap: theme.space(2) },
  content: { padding: theme.space(4), gap: theme.space(3), paddingBottom: theme.space(10) },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.space(3) },
  stage: {
    ...theme.text.small,
    fontWeight: '600',
    color: theme.color.brandDark,
  },
});
