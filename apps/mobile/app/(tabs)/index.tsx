import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { formatMoney } from '@yaseen/shared';
import * as resources from '../../src/api/resources';
import type { Product } from '../../src/api/types';
import { Empty, ErrorNote, Field, Loading, Screen } from '../../src/components/ui';
import { useI18n } from '../../src/i18n';
import { theme } from '../../src/theme';

const KINDS = [
  { key: '', label: 'shop.all' },
  { key: 'UNSTITCHED', label: 'shop.unstitched' },
  { key: 'READY_TO_WEAR', label: 'shop.readyToWear' },
  { key: 'STITCHING_SERVICE', label: 'shop.stitchingServices' },
] as const;

/** The catalogue: search, filter by kind, tap through to a product. */
export default function ShopScreen() {
  const { t, locale } = useI18n();

  const [products, setProducts] = useState<Product[] | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const page = await resources.listProducts({
        locale,
        q: query || undefined,
        kind: kind || undefined,
        pageSize: 30,
      });
      setProducts(page.data);
    } catch {
      setError(t('common.offline'));
      setProducts([]);
    }
  }, [locale, query, kind, t]);

  // Debounced, so typing a search does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => void load(), 300);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <Screen>
      <View style={styles.header}>
        <Field
          label={t('shop.search')}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          autoCorrect={false}
        />

        <View style={styles.filters}>
          {KINDS.map((option) => (
            <Pressable
              key={option.key || 'all'}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === option.key }}
              onPress={() => setKind(option.key)}
              style={[styles.filter, kind === option.key && styles.filterOn]}
            >
              <Text style={[styles.filterLabel, kind === option.key && styles.filterLabelOn]}>
                {t(option.label)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ErrorNote message={error} />

      {!products ? (
        <Loading />
      ) : products.length === 0 ? (
        <Empty message={t('shop.empty')} />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(product) => product.id}
          numColumns={2}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load().finally(() => setRefreshing(false));
              }}
            />
          }
          renderItem={({ item }) => <ProductCard product={item} locale={locale} />}
        />
      )}
    </Screen>
  );
}

function ProductCard({ product, locale }: { product: Product; locale: 'en' | 'ur' }) {
  const { t } = useI18n();
  const image = product.images.find((candidate) => candidate.isPrimary) ?? product.images[0];

  return (
    <Link href={`/product/${product.slug}`} asChild>
      <Pressable style={styles.card} accessibilityRole="button">
        {image ? (
          <Image source={{ uri: image.url }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]} />
        )}

        <Text numberOfLines={2} style={styles.name}>
          {product.name}
        </Text>

        <Text style={styles.price}>
          {product.fromPrice !== product.basePrice ? `${t('shop.from')} ` : ''}
          {formatMoney(product.fromPrice, locale)}
        </Text>

        {!product.inStock ? <Text style={styles.outOfStock}>{t('product.outOfStock')}</Text> : null}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: theme.space(4), paddingTop: theme.space(3) },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2) },
  filter: {
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(2),
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.sandDeep,
  },
  filterOn: { backgroundColor: theme.color.brand },
  filterLabel: { ...theme.text.small, color: theme.color.ink },
  filterLabelOn: { color: '#ffffff', fontWeight: '600' },

  list: { padding: theme.space(4), gap: theme.space(4) },
  column: { gap: theme.space(4) },
  card: {
    flex: 1,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.line,
    overflow: 'hidden',
    padding: theme.space(2),
  },
  image: { width: '100%', aspectRatio: 3 / 4, borderRadius: theme.radius.sm },
  imagePlaceholder: { backgroundColor: theme.color.sandDeep },
  name: { ...theme.text.small, color: theme.color.ink, marginTop: theme.space(2) },
  price: {
    ...theme.text.body,
    fontWeight: '600',
    color: theme.color.ink,
    marginTop: theme.space(1),
  },
  outOfStock: { ...theme.text.tiny, color: theme.color.danger, marginTop: theme.space(1) },
});
