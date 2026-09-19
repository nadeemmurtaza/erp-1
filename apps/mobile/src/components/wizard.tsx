import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
import { Button } from './ui';

export interface WizardStep {
  id: string;
  label: string;
  content: React.ReactNode;
  /** Whether the user may leave this step going forward. */
  isValid: boolean;
}

/**
 * A form split into small, single-purpose steps instead of one long screen.
 *
 * Mirrors apps/web/src/components/common/wizard.tsx's shape (steps, step
 * gating, a step already reached stays tappable) rendered with React Native
 * primitives instead of DOM/Tailwind, since the two apps don't share a
 * component tree.
 */
export function Wizard({
  steps,
  onSubmit,
  submitLabel,
  submitBusy,
  submitDisabled,
  backLabel = 'Back',
  nextLabel = 'Next',
}: {
  steps: WizardStep[];
  onSubmit: () => void;
  submitLabel: string;
  submitBusy?: boolean;
  submitDisabled?: boolean;
  backLabel?: string;
  nextLabel?: string;
}) {
  const [index, setIndex] = useState(0);
  const [furthest, setFurthest] = useState(0);

  const step = steps[index];
  if (!step) return null;
  const isLast = index === steps.length - 1;

  function goNext() {
    if (!step!.isValid) return;
    const next = Math.min(index + 1, steps.length - 1);
    setIndex(next);
    setFurthest((f) => Math.max(f, next));
  }

  function goBack() {
    setIndex((current) => Math.max(current - 1, 0));
  }

  function goTo(target: number) {
    if (target <= furthest) setIndex(target);
  }

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.railScroll}>
        <View style={styles.rail}>
          {steps.map((s, i) => {
            const reachable = i <= furthest;
            const active = i === index;
            return (
              <Pressable
                key={s.id}
                disabled={!reachable}
                onPress={() => goTo(i)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active, disabled: !reachable }}
                style={[styles.tab, active && styles.tabActive]}
              >
                <View style={[styles.dot, active && styles.dotActive]}>
                  <Text style={[styles.dotLabel, active && styles.dotLabelActive]}>{i + 1}</Text>
                </View>
                <Text style={[styles.tabLabel, active && styles.tabLabelActive, !reachable && styles.tabLabelUnreached]}>
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.content}>{step.content}</View>

      <View style={styles.footer}>
        {index > 0 ? <Button label={backLabel} variant="quiet" onPress={goBack} /> : <View />}
        {isLast ? (
          <Button
            label={submitLabel}
            onPress={onSubmit}
            busy={submitBusy}
            disabled={submitDisabled || !step.isValid}
          />
        ) : (
          <Button label={nextLabel} onPress={goNext} disabled={!step.isValid} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  railScroll: { flexGrow: 0 },
  rail: { flexDirection: 'row', gap: theme.space(2), paddingBottom: theme.space(2) },
  tab: { flexDirection: 'row', alignItems: 'center', gap: theme.space(1.5), paddingVertical: theme.space(1) },
  tabActive: {},
  dot: {
    height: 22,
    width: 22,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  dotActive: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
  dotLabel: { ...theme.text.tiny, fontWeight: '700', color: theme.color.inkSoft },
  dotLabelActive: { color: theme.color.surface },
  tabLabel: { ...theme.text.small, color: theme.color.inkFaint, fontWeight: '600' },
  tabLabelActive: { color: theme.color.ink },
  tabLabelUnreached: { color: theme.color.inkFaint },
  content: { marginTop: theme.space(3), gap: theme.space(4) },
  footer: {
    marginTop: theme.space(5),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space(3),
  },
});
