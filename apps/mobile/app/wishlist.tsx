import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as resources from '../src/api/resources';
import type { WishlistItem } from '../src/api/types';
import {
  Body,
  Button,
  Card,
  Empty,
  ErrorNote,
  Loading,
  Price,
  Screen,
  Small,
} from '../src/components/ui';
import { useI18n } from '../src/i18n';
import { theme } from '../src/theme';

/** WO-7.6 — the server-side wishlist, and asking to be told when something comes back in stock. */
export default function WishlistScreen() {
  const { t } = useI18n();
  const [items, setItems] = useState<WishlistItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notified, setNotified] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    resources
      .listWishlist()
      .then(setItems)
      .catch(() => {
        setError(t('common.offline'));
        setItems([]);
      });
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id: string) {
    const previous = items;
    setItems((current) => current?.filter((item) => item.id !== id) ?? current);
    try {
      await resources.removeFromWishlist(id);
    } catch {
      setItems(previous ?? null);
    }
  }

  async function notify(item: WishlistItem) {
    if (!item.variantId) return;
    try {
      await resources.requestBackInStockAlert(item.variantId);
      setNotified((current) => new Set(current).add(item.id));
    } catch {
      // Not worth an error screen — the button simply stays available to try again.
    }
  }

  if (!items) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  if (items.length === 0) {
    return (
      <Screen>
        <ErrorNote message={error} />
        <Empty
          message={t('wishlist.emptyBody')}
          action={
            <Button label={t('cart.goShopping')} variant="secondary" onPress={() => router.push('/')} />
          }
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {items.map((item) => (
          <Card key={item.id}>
            <Pressable
              accessibilityRole="button"
              style={styles.row}
              onPress={() => router.push(`/product/${item.slug}`)}
            >
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.image} />
              ) : (
                <View style={[styles.image, styles.imageEmpty]} />
              )}
              <View style={styles.info}>
                <Body>{item.name}</Body>
                {item.variantLabel ? <Small muted>{item.variantLabel}</Small> : null}
                <Price amount={item.price} />
                {!item.inStock ? <Small muted>{t('wishlist.outOfStock')}</Small> : null}
              </View>
            </Pressable>

            <View style={styles.actions}>
              {!item.inStock && item.variantId ? (
                <Button
                  label={notified.has(item.id) ? t('product.notifyRequested') : t('wishlist.notifyMe')}
                  variant="secondary"
                  disabled={notified.has(item.id)}
                  onPress={() => void notify(item)}
                />
              ) : null}
              <Button label={t('wishlist.remove')} variant="quiet" onPress={() => void remove(item.id)} />
            </View>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(3), paddingBottom: theme.space(10) },
  row: { flexDirection: 'row', gap: theme.space(3) },
  image: { width: 64, height: 84, borderRadius: theme.radius.sm },
  imageEmpty: { backgroundColor: theme.color.sandDeep },
  info: { flex: 1, gap: theme.space(1) },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.space(2),
    marginTop: theme.space(3),
  },
});
