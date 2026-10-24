import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import * as resources from '../src/api/resources';
import type { Review, ReviewStatus } from '../src/api/types';
import { Body, Card, Empty, Loading, Screen, Small } from '../src/components/ui';
import { useI18n } from '../src/i18n';
import { theme } from '../src/theme';

const STATUS_KEY: Record<ReviewStatus, 'reviews.statusPending' | 'reviews.statusPublished' | 'reviews.statusRejected'> = {
  PENDING: 'reviews.statusPending',
  PUBLISHED: 'reviews.statusPublished',
  REJECTED: 'reviews.statusRejected',
};

/** WO-7.5 — what this customer has said about what they bought. */
export default function MyReviewsScreen() {
  const { t, date } = useI18n();
  const [reviews, setReviews] = useState<Review[] | null>(null);

  useEffect(() => {
    resources
      .myReviews()
      .then(setReviews)
      .catch(() => setReviews([]));
  }, []);

  if (!reviews) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  if (reviews.length === 0) {
    return (
      <Screen>
        <Empty message={t('reviews.empty')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {reviews.map((review) => (
          <Card key={review.id}>
            <View style={styles.head}>
              <Body>{'★'.repeat(review.rating)}</Body>
              <Small muted>{t(STATUS_KEY[review.status])}</Small>
            </View>
            {review.title ? <Body>{review.title}</Body> : null}
            {review.body ? <Body muted>{review.body}</Body> : null}
            {review.staffReply ? <Small muted>{review.staffReply}</Small> : null}
            <Small muted>{date(review.createdAt)}</Small>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(3), paddingBottom: theme.space(10) },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.space(2) },
});
