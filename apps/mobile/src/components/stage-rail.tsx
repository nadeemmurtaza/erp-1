import { StyleSheet, Text, View } from 'react-native';
import { STITCHING_STAGES, type StitchingStage } from '@yaseen/shared';
import { useI18n } from '../i18n';
import { theme } from '../theme';
import type { TimelineEvent } from '../api/types';

/** Dispatch is an order status; the rail a customer watches ends at ready. */
const VISIBLE = STITCHING_STAGES.filter((stage) => stage !== 'DISPATCHED');

/**
 * How far along one garment is — the same five steps the website draws, so a
 * customer who checks on their phone sees what they saw in the browser.
 */
export function StageRail({
  stage,
  events = [],
  dueAt,
}: {
  stage: StitchingStage;
  events?: TimelineEvent[];
  dueAt?: string | null;
}) {
  const { t, date } = useI18n();

  const reached = VISIBLE.indexOf(stage as (typeof VISIBLE)[number]);
  const through = stage === 'DISPATCHED' ? VISIBLE.length - 1 : reached;

  const reachedAt = new Map<string, string>();
  for (const event of events) reachedAt.set(event.toStage, event.createdAt);

  return (
    <View>
      <View style={styles.rail}>
        {VISIBLE.map((entry, index) => {
          const done = index <= through;
          const current = index === through;
          const at = reachedAt.get(entry);

          return (
            <View key={entry} style={styles.step}>
              <View style={[styles.bar, done ? styles.barDone : styles.barToDo]} />
              <Text
                numberOfLines={2}
                style={[styles.label, current && styles.labelCurrent, !done && styles.labelToDo]}
              >
                {t(`stage.${entry}` as never)}
              </Text>
              {at ? <Text style={styles.when}>{date(at)}</Text> : null}
            </View>
          );
        })}
      </View>

      {dueAt ? (
        <Text style={styles.promised}>{t('stitching.promisedFor', { date: date(dueAt) })}</Text>
      ) : null}

      {events
        .filter((event) => event.note)
        .map((event, index) => (
          <Text key={index} style={styles.note}>
            {t(`stage.${event.toStage}` as never)} — {event.note}
          </Text>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { flexDirection: 'row', gap: theme.space(1) },
  step: { flex: 1, gap: theme.space(1) },
  bar: { height: 5, borderRadius: theme.radius.pill },
  barDone: { backgroundColor: theme.color.brand },
  barToDo: { backgroundColor: theme.color.sandDeep },
  label: { ...theme.text.tiny, color: theme.color.inkSoft },
  labelCurrent: { color: theme.color.brandDark, fontWeight: '700' },
  labelToDo: { color: theme.color.inkFaint },
  when: { ...theme.text.tiny, color: theme.color.inkFaint },
  promised: { ...theme.text.small, color: theme.color.inkSoft, marginTop: theme.space(2) },
  note: { ...theme.text.small, color: theme.color.inkSoft, marginTop: theme.space(1) },
});
