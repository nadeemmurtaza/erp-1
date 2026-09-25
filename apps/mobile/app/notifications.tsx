import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import * as resources from '../src/api/resources';
import type { NotificationCategory, NotificationChannel, NotificationPreferenceCell } from '../src/api/types';
import { Button, Card, Heading, Loading, Screen, Small } from '../src/components/ui';
import { useI18n } from '../src/i18n';
import { theme } from '../src/theme';

const CHANNELS: NotificationChannel[] = ['EMAIL', 'SMS', 'WHATSAPP', 'PUSH'];
const CATEGORIES: NotificationCategory[] = ['STITCHING_PROGRESS', 'MARKETING', 'BACK_IN_STOCK'];

/** WO-7.8 — per-channel, per-category. Transactional messages are not opt-out and don't appear here. */
export default function NotificationPreferencesScreen() {
  const { t } = useI18n();
  const [cells, setCells] = useState<NotificationPreferenceCell[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    resources
      .getNotificationPreferences()
      .then(setCells)
      .catch(() => setCells([]));
  }, []);

  function toggle(channel: NotificationChannel, category: NotificationCategory) {
    setCells((current) =>
      current
        ? current.map((cell) =>
            cell.channel === channel && cell.category === category
              ? { ...cell, enabled: !cell.enabled }
              : cell,
          )
        : current,
    );
    setSaved(false);
  }

  async function save() {
    if (!cells) return;
    setSaving(true);
    try {
      const updated = await resources.updateNotificationPreferences(cells);
      setCells(updated);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (cells === null) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Small muted>{t('notifications.body')}</Small>

        {CATEGORIES.map((category) => (
          <Card key={category}>
            <Heading>{t(`notifications.category.${category}` as never)}</Heading>
            {CHANNELS.map((channel) => {
              const cell = cells.find((c) => c.channel === channel && c.category === category);
              return (
                <View key={channel} style={styles.row}>
                  <Small>{t(`notifications.channel.${channel}` as never)}</Small>
                  <Switch
                    value={cell?.enabled ?? true}
                    onValueChange={() => toggle(channel, category)}
                    accessibilityLabel={`${t(`notifications.category.${category}` as never)} — ${t(`notifications.channel.${channel}` as never)}`}
                    trackColor={{ true: theme.color.brand, false: theme.color.sandDeep }}
                  />
                </View>
              );
            })}
          </Card>
        ))}

        <Button label={saving ? t('notifications.saving') : t('notifications.save')} busy={saving} onPress={() => void save()} />
        {saved ? <Small muted>{t('notifications.saved')}</Small> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(3), paddingBottom: theme.space(10) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.space(2),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.color.line,
  },
});
