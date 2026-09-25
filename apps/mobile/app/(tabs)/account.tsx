import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import type { Locale } from '@newax/shared';
import {
  Body,
  Button,
  Card,
  Chip,
  Heading,
  Screen,
  Small,
  Title,
} from '../../src/components/ui';
import { useI18n } from '../../src/i18n';
import { pushRegistered, registerForPush, unregisterPush } from '../../src/push';
import { useAuth } from '../../src/state/auth';
import { theme } from '../../src/theme';

const LANGUAGES: Array<{ code: Locale; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'ur', label: 'اردو' },
];

/** Sign in, language, notifications, and the way into everything personal. */
export default function AccountScreen() {
  const { t, locale, setLocale } = useI18n();
  const { user, signOut } = useAuth();

  const [pushOn, setPushOn] = useState(false);
  const [pushNote, setPushNote] = useState<string | null>(null);

  useEffect(() => {
    void pushRegistered().then(setPushOn);
  }, [user]);

  async function togglePush(next: boolean) {
    setPushNote(null);

    if (!next) {
      await unregisterPush().catch(() => undefined);
      setPushOn(false);
      return;
    }

    const token = await registerForPush();
    if (token) {
      setPushOn(true);
      setPushNote(t('account.notificationsOn'));
    } else {
      setPushOn(false);
      setPushNote(t('account.notificationsDenied'));
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>{t('account.title')}</Title>

        <Card>
          {user ? (
            <>
              <Heading>
                {[user.firstName, user.lastName].filter(Boolean).join(' ') ||
                  user.email ||
                  user.phone}
              </Heading>
              <Small muted>{user.role.toLowerCase()}</Small>
            </>
          ) : (
            <>
              <Body muted>{t('account.guest')}</Body>
              <Button label={t('account.signIn')} onPress={() => router.push('/login')} />
            </>
          )}
        </Card>

        {user ? (
          <Card>
            <Button
              label={t('account.orders')}
              variant="secondary"
              onPress={() => router.push('/orders')}
            />
            <View style={styles.gap} />
            <Button
              label={t('account.measurements')}
              variant="secondary"
              onPress={() => router.push('/measurements')}
            />
            {user.role === 'TAILOR' || user.role === 'ADMIN' || user.role === 'STAFF' ? (
              <>
                <View style={styles.gap} />
                <Button
                  label={t('account.workshop')}
                  variant="secondary"
                  onPress={() => router.push('/workshop')}
                />
              </>
            ) : null}
          </Card>
        ) : null}

        {user ? (
          <Card>
            <Button
              label={t('account.wishlist')}
              variant="secondary"
              onPress={() => router.push('/wishlist')}
            />
            <View style={styles.gap} />
            <Button
              label={t('account.returns')}
              variant="secondary"
              onPress={() => router.push('/returns')}
            />
            <View style={styles.gap} />
            <Button
              label={t('account.loyalty')}
              variant="secondary"
              onPress={() => router.push('/loyalty')}
            />
            <View style={styles.gap} />
            <Button
              label={t('account.credit')}
              variant="secondary"
              onPress={() => router.push('/credit')}
            />
            <View style={styles.gap} />
            <Button
              label={t('account.reviews')}
              variant="secondary"
              onPress={() => router.push('/reviews')}
            />
            <View style={styles.gap} />
            <Button
              label={t('account.notificationSettings')}
              variant="secondary"
              onPress={() => router.push('/notifications')}
            />
          </Card>
        ) : null}

        {user ? (
          <Card>
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <Heading>{t('account.notifications')}</Heading>
              </View>
              <Switch
                value={pushOn}
                onValueChange={(next) => void togglePush(next)}
                accessibilityLabel={t('account.notifications')}
                trackColor={{ true: theme.color.brand, false: theme.color.sandDeep }}
              />
            </View>
            {pushNote ? <Small muted>{pushNote}</Small> : null}
          </Card>
        ) : null}

        <Card>
          <Heading>{t('account.language')}</Heading>
          <View style={styles.chips}>
            {LANGUAGES.map((language) => (
              <Chip
                key={language.code}
                label={language.label}
                selected={locale === language.code}
                onPress={() => setLocale(language.code)}
              />
            ))}
          </View>
        </Card>

        {user ? (
          <Button
            label={t('account.signOut')}
            variant="danger"
            onPress={() => void signOut()}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(4), paddingBottom: theme.space(10) },
  chips: { flexDirection: 'row', gap: theme.space(2), marginTop: theme.space(2) },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space(3) },
  switchLabel: { flex: 1 },
  gap: { height: theme.space(2) },
});
