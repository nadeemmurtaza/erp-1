import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Body, Button, Card, ErrorNote, Field, Screen, Title } from '../src/components/ui';
import { useI18n } from '../src/i18n';
import { useAuth } from '../src/state/auth';
import { theme } from '../src/theme';

/** Signing in. A phone number works as well as an email, as it does on the web. */
export default function LoginScreen() {
  const { t } = useI18n();
  const { signIn } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const user = await signIn(identifier.trim(), password);
      // A tailor's reason for signing in is their queue.
      router.replace(user.role === 'TAILOR' ? '/workshop' : '/');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('account.signInFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Title>{t('account.signIn')}</Title>

        <Card>
          <Field
            label={t('account.email')}
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
          />
          <Field
            label={t('account.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
          />

          <ErrorNote message={error} />

          <Button
            label={t('account.signIn')}
            busy={busy}
            disabled={!identifier || !password}
            onPress={() => void submit()}
          />
        </Card>

        <Body muted>{t('account.guest')}</Body>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(4) },
});
