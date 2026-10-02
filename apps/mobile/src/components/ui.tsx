import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { formatMoney, type Locale } from '@newax/shared';
import { useI18n } from '../i18n';
import { theme } from '../theme';

/** The small pieces every screen is built from. */

export function Screen({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Title({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Heading({ children }: { children: React.ReactNode }) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function Body({
  children,
  muted,
  style,
}: {
  children: React.ReactNode;
  muted?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Text style={[styles.body, muted && styles.muted, style as never]}>{children}</Text>
  );
}

export function Small({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <Text style={[styles.small, muted && styles.muted]}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  disabled?: boolean;
  busy?: boolean;
}) {
  const isDisabled = disabled || busy;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(isDisabled) }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'quiet' && styles.buttonQuiet,
        variant === 'danger' && styles.buttonDanger,
        pressed && !isDisabled && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'primary' ? theme.color.surface : theme.color.brand} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            variant === 'primary' && styles.buttonLabelPrimary,
            variant === 'danger' && styles.buttonLabelDanger,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  invalid,
  ...props
}: TextInputProps & { label: string; hint?: string; invalid?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.color.inkFaint}
        {...props}
        style={[styles.input, invalid && styles.inputInvalid]}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <View accessibilityRole="alert" style={styles.error}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function Loading() {
  const { t } = useI18n();

  return (
    <View style={styles.centred}>
      <ActivityIndicator color={theme.color.brand} />
      <Text style={[styles.small, styles.muted, { marginTop: theme.space(2) }]}>
        {t('common.loading')}
      </Text>
    </View>
  );
}

export function Empty({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <View style={styles.centred}>
      <Text style={[styles.body, styles.muted]}>{message}</Text>
      {action ? <View style={{ marginTop: theme.space(4) }}>{action}</View> : null}
    </View>
  );
}

export function Price({
  amount,
  locale,
  style,
}: {
  amount: number;
  locale?: Locale;
  style?: StyleProp<ViewStyle>;
}) {
  const { locale: current } = useI18n();
  return (
    <Text style={[styles.price, style as never]}>{formatMoney(amount, locale ?? current)}</Text>
  );
}

export function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.body, styles.muted]}>{label}</Text>
      <Text style={[styles.body, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.sand },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.line,
    padding: theme.space(4),
  },
  title: { ...theme.text.title, color: theme.color.ink },
  heading: { ...theme.text.heading, color: theme.color.ink },
  body: { ...theme.text.body, color: theme.color.ink },
  small: { ...theme.text.small, color: theme.color.ink },
  muted: { color: theme.color.inkSoft },
  strong: { fontWeight: '600' },
  price: { ...theme.text.body, fontWeight: '600', color: theme.color.ink },

  button: {
    minHeight: 46,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space(5),
  },
  buttonPrimary: { backgroundColor: theme.color.brand },
  buttonSecondary: {
    backgroundColor: theme.color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.brand,
  },
  buttonQuiet: { backgroundColor: 'transparent' },
  buttonDanger: { backgroundColor: theme.color.dangerSoft },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: { ...theme.text.body, fontWeight: '600', color: theme.color.brand },
  buttonLabelPrimary: { color: theme.color.surface },
  buttonLabelDanger: { color: theme.color.danger },

  field: { marginBottom: theme.space(3) },
  fieldLabel: {
    ...theme.text.small,
    color: theme.color.inkSoft,
    marginBottom: theme.space(1),
  },
  input: {
    minHeight: 44,
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surface,
    paddingHorizontal: theme.space(3),
    ...theme.text.body,
    color: theme.color.ink,
    textAlign: 'auto',
  },
  inputInvalid: { borderColor: theme.color.danger, borderWidth: 1 },
  hint: { ...theme.text.tiny, color: theme.color.inkFaint, marginTop: theme.space(1) },

  error: {
    backgroundColor: theme.color.dangerSoft,
    borderRadius: theme.radius.sm,
    padding: theme.space(3),
    marginBottom: theme.space(3),
  },
  errorText: { ...theme.text.small, color: theme.color.danger },

  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.space(8) },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.space(1),
    gap: theme.space(3),
  },

  chip: {
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(2),
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.sandDeep,
  },
  chipSelected: { backgroundColor: theme.color.brand },
  chipLabel: { ...theme.text.small, color: theme.color.ink },
  chipLabelSelected: { color: theme.color.surface, fontWeight: '600' },
});
