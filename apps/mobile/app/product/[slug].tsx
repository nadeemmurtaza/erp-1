import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { computeStitchingFee, formatMoney } from '@newax/shared';
import * as resources from '../../src/api/resources';
import type {
  MeasurementProfile,
  Product,
  ProductVariant,
  Review,
  StitchingOptionGroup,
} from '../../src/api/types';
import {
  Body,
  Button,
  Card,
  Chip,
  Empty,
  ErrorNote,
  Field,
  Heading,
  Loading,
  Price,
  Screen,
  Small,
  Title,
} from '../../src/components/ui';
import { useI18n } from '../../src/i18n';
import { useAuth } from '../../src/state/auth';
import { useCart } from '../../src/state/cart';
import { theme } from '../../src/theme';

/**
 * One product, and the decision that goes with it.
 *
 * On unstitched fabric the stitching panel appears: garment, service, style
 * options, measurements. The running fee uses the same `computeStitchingFee`
 * the API charges with, so the number on the phone is the number on the bill.
 */
export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { add } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [variantId, setVariantId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [stitch, setStitch] = useState(false);
  const [garmentKey, setGarmentKey] = useState('');
  const [services, setServices] = useState<Product[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [groups, setGroups] = useState<StitchingOptionGroup[]>([]);
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<MeasurementProfile[]>([]);
  const [profileId, setProfileId] = useState('');
  const [notes, setNotes] = useState('');

  const [savedId, setSavedId] = useState<string | null>(null);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [notifyRequested, setNotifyRequested] = useState(false);

  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [rating, setRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewBody, setReviewBody] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;

    void resources
      .getProduct(slug, locale)
      .then((loaded) => {
        setProduct(loaded);
        setVariantId(loaded.variants.find((variant) => variant.inStock)?.id ?? '');
        setGarmentKey(loaded.garmentTypes[0]?.key ?? '');
      })
      .catch(() => setError(t('common.offline')));
  }, [slug, locale, t]);

  useEffect(() => {
    if (!product) return;
    void resources
      .productReviews(product.id)
      .then((page) => setReviews(page.data))
      .catch(() => setReviews([]));
  }, [product]);

  useEffect(() => {
    if (!product || !user) {
      setSavedId(null);
      return;
    }
    let cancelled = false;
    void resources.listWishlist().then((items) => {
      if (cancelled) return;
      setSavedId(items.find((item) => item.productId === product.id)?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [product, user]);

  async function toggleWishlist() {
    if (!product || !user) {
      router.push('/login');
      return;
    }
    setWishlistBusy(true);
    try {
      if (savedId) {
        await resources.removeFromWishlist(savedId);
        setSavedId(null);
      } else {
        const created = await resources.addToWishlist(product.id);
        setSavedId(created.id);
      }
    } finally {
      setWishlistBusy(false);
    }
  }

  async function notifyBackInStock() {
    if (!variant) return;
    try {
      await resources.requestBackInStockAlert(variant.id);
      setNotifyRequested(true);
    } catch {
      // Not worth an error screen — the button simply stays available to try again.
    }
  }

  async function submitReview() {
    if (!product) return;
    setReviewBusy(true);
    setReviewMessage(null);
    try {
      await resources.submitReview({
        productId: product.id,
        rating,
        title: reviewTitle || undefined,
        body: reviewBody || undefined,
      });
      setReviewMessage(t('product.reviewSubmitted'));
      setReviewTitle('');
      setReviewBody('');
    } catch (cause) {
      setReviewMessage(cause instanceof Error ? cause.message : t('product.reviewFailed'));
    } finally {
      setReviewBusy(false);
    }
  }

  // The garment drives everything else: which services apply, which style
  // options exist, and which saved measurements can be used.
  useEffect(() => {
    if (!stitch || !garmentKey) return;
    let cancelled = false;

    void Promise.all([
      resources.listStitchingServices(garmentKey, locale),
      resources.listOptionGroups(garmentKey),
      user ? resources.listProfiles() : Promise.resolve([]),
    ]).then(([loadedServices, loadedGroups, loadedProfiles]) => {
      if (cancelled) return;

      setServices(loadedServices);
      setServiceId(loadedServices[0]?.id ?? '');
      setGroups(loadedGroups);
      // Start on the cheapest valid answer in each required group, rather than
      // in an error state the customer has to clear.
      setOptionIds(
        loadedGroups
          .filter((group) => group.required)
          .map((group) => {
            const cheapest =
              group.options.find((option) => option.priceDelta === 0) ?? group.options[0];
            return cheapest?.id;
          })
          .filter((id): id is string => Boolean(id)),
      );

      const matching = loadedProfiles.filter(
        (profile) => profile.garmentType.key === garmentKey,
      );
      setProfiles(matching);
      setProfileId(matching.find((profile) => profile.isDefault)?.id ?? matching[0]?.id ?? '');
    });

    return () => {
      cancelled = true;
    };
  }, [stitch, garmentKey, locale, user]);

  const variant: ProductVariant | undefined = product?.variants.find(
    (candidate) => candidate.id === variantId,
  );
  const service = services.find((candidate) => candidate.id === serviceId);

  const stitchingFee =
    stitch && service
      ? computeStitchingFee({
          baseFee: service.basePrice,
          optionDeltas: groups
            .flatMap((group) => group.options)
            .filter((option) => optionIds.includes(option.id))
            .map((option) => option.priceDelta),
        })
      : 0;

  const toggleOption = useCallback(
    (group: StitchingOptionGroup, optionId: string) => {
      setOptionIds((current) => {
        if (group.selectionType === 'MULTI') {
          return current.includes(optionId)
            ? current.filter((id) => id !== optionId)
            : [...current, optionId];
        }

        const others = current.filter(
          (id) => !group.options.some((option) => option.id === id),
        );
        return [...others, optionId];
      });
    },
    [],
  );

  async function addToCart() {
    if (!variant) return;

    setBusy(true);
    setError(null);
    try {
      await add({
        variantId: variant.id,
        quantity: 1,
        stitching:
          stitch && serviceId
            ? {
                stitchingServiceId: serviceId,
                measurementProfileId: profileId || undefined,
                optionIds,
                notes: notes || undefined,
              }
            : undefined,
      });
      router.push('/cart');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('common.somethingWrong'));
    } finally {
      setBusy(false);
    }
  }

  if (!product) {
    return <Screen>{error ? <ErrorNote message={error} /> : <Loading />}</Screen>;
  }

  const image = product.images.find((candidate) => candidate.isPrimary) ?? product.images[0];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {image ? (
          <Image source={{ uri: image.url }} style={styles.hero} resizeMode="cover" />
        ) : null}

        <View style={styles.titleRow}>
          <View style={styles.titleColumn}>
            <Title>{product.name}</Title>
            <Price amount={variant?.price ?? product.fromPrice} />
          </View>
          <Button
            label={savedId ? t('product.saved') : t('product.save')}
            variant={savedId ? 'primary' : 'secondary'}
            busy={wishlistBusy}
            onPress={() => void toggleWishlist()}
          />
        </View>
        {product.description ? <Body muted>{product.description}</Body> : null}

        {product.variants.length > 1 ? (
          <Card>
            <Heading>{t('product.variant')}</Heading>
            <View style={styles.chips}>
              {product.variants.map((option) => (
                <Chip
                  key={option.id}
                  label={
                    [option.color, option.size].filter(Boolean).join(' · ') || option.sku
                  }
                  selected={option.id === variantId}
                  onPress={() => option.inStock && setVariantId(option.id)}
                />
              ))}
            </View>
            {variant && !variant.inStock ? (
              <View style={styles.notifyRow}>
                <Small muted>{t('product.outOfStock')}</Small>
                <Button
                  label={notifyRequested ? t('product.notifyRequested') : t('product.notifyWhenBack')}
                  variant="quiet"
                  disabled={notifyRequested}
                  onPress={() => void notifyBackInStock()}
                />
              </View>
            ) : null}
          </Card>
        ) : null}

        {product.stitchingAvailable && product.garmentTypes.length > 0 ? (
          <Card>
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <Heading>{t('product.getStitched')}</Heading>
              </View>
              <Switch
                value={stitch}
                onValueChange={setStitch}
                accessibilityLabel={t('product.getStitched')}
                trackColor={{ true: theme.color.brand, false: theme.color.sandDeep }}
              />
            </View>

            {stitch ? (
              <View style={styles.stitching}>
                <Small muted>{t('product.garment')}</Small>
                <View style={styles.chips}>
                  {product.garmentTypes.map((garment) => (
                    <Chip
                      key={garment.id}
                      label={garment.label}
                      selected={garment.key === garmentKey}
                      onPress={() => setGarmentKey(garment.key)}
                    />
                  ))}
                </View>

                {services.length > 1 ? (
                  <>
                    <Small muted>{t('product.service')}</Small>
                    <View style={styles.chips}>
                      {services.map((option) => (
                        <Chip
                          key={option.id}
                          label={`${option.name} · ${formatMoney(option.basePrice, locale)}`}
                          selected={option.id === serviceId}
                          onPress={() => setServiceId(option.id)}
                        />
                      ))}
                    </View>
                  </>
                ) : null}

                {groups.map((group) => (
                  <View key={group.id}>
                    <Small muted>
                      {locale === 'ur' ? group.labelUr : group.labelEn}
                      {group.required ? ' *' : ''}
                    </Small>
                    <View style={styles.chips}>
                      {group.options.map((option) => (
                        <Chip
                          key={option.id}
                          label={
                            (locale === 'ur' ? option.labelUr : option.labelEn) +
                            (option.priceDelta > 0
                              ? ` +${formatMoney(option.priceDelta, locale)}`
                              : '')
                          }
                          selected={optionIds.includes(option.id)}
                          onPress={() => toggleOption(group, option.id)}
                        />
                      ))}
                    </View>
                  </View>
                ))}

                <Small muted>{t('product.measurements')}</Small>
                {!user ? (
                  <Body muted>{t('product.signInForMeasurements')}</Body>
                ) : profiles.length === 0 ? (
                  <>
                    <Body muted>{t('product.noProfiles')}</Body>
                    <Button
                      label={t('measurements.add')}
                      variant="secondary"
                      onPress={() => router.push('/measurements')}
                    />
                  </>
                ) : (
                  <View style={styles.chips}>
                    {profiles.map((profile) => (
                      <Chip
                        key={profile.id}
                        label={profile.label}
                        selected={profile.id === profileId}
                        onPress={() => setProfileId(profile.id)}
                      />
                    ))}
                  </View>
                )}

                <Field
                  label={t('product.notes')}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                />

                <View style={styles.feeRow}>
                  <Body muted>{t('product.stitchingFee')}</Body>
                  <Price amount={stitchingFee} />
                </View>
              </View>
            ) : null}
          </Card>
        ) : null}

        <ErrorNote message={error} />

        <Button
          label={t('product.addToCart')}
          onPress={() => void addToCart()}
          busy={busy}
          disabled={!variant?.inStock}
        />

        <Card>
          <Heading>{t('product.reviewsTitle')}</Heading>

          {reviews === null ? (
            <Loading />
          ) : reviews.length === 0 ? (
            <Empty message={t('product.reviewsEmpty')} />
          ) : (
            <View style={styles.reviewList}>
              {reviews.map((review) => (
                <View key={review.id} style={styles.review}>
                  <Body>{'★'.repeat(review.rating)}</Body>
                  {review.title ? <Body>{review.title}</Body> : null}
                  {review.body ? <Body muted>{review.body}</Body> : null}
                </View>
              ))}
            </View>
          )}

          {user ? (
            <View style={styles.reviewForm}>
              <Small muted>{t('product.reviewRating')}</Small>
              <View style={styles.chips}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <Chip
                    key={value}
                    label={'★'.repeat(value)}
                    selected={rating === value}
                    onPress={() => setRating(value)}
                  />
                ))}
              </View>
              <Field label={t('product.reviewTitleField')} value={reviewTitle} onChangeText={setReviewTitle} />
              <Field
                label={t('product.reviewBody')}
                value={reviewBody}
                onChangeText={setReviewBody}
                multiline
              />
              {reviewMessage ? <Small muted>{reviewMessage}</Small> : null}
              <Button
                label={t('product.reviewSubmit')}
                variant="secondary"
                busy={reviewBusy}
                onPress={() => void submitReview()}
              />
            </View>
          ) : (
            <Small muted>{t('product.signInToReview')}</Small>
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(4), paddingBottom: theme.space(10) },
  hero: { width: '100%', aspectRatio: 3 / 4, borderRadius: theme.radius.md },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.space(3) },
  titleColumn: { flex: 1, gap: theme.space(1) },
  notifyRow: {
    marginTop: theme.space(2),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space(2),
  },
  reviewList: { gap: theme.space(3), marginTop: theme.space(2) },
  review: {
    paddingBottom: theme.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.color.line,
    gap: theme.space(1),
  },
  reviewForm: { marginTop: theme.space(4), gap: theme.space(1) },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space(2),
    marginVertical: theme.space(2),
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space(3) },
  switchLabel: { flex: 1 },
  stitching: { marginTop: theme.space(3), gap: theme.space(1) },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.space(2),
    paddingTop: theme.space(3),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.color.line,
  },
});
