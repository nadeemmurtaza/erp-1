import type { Metadata } from 'next';
import { DesignSystemGallery } from '@/components/design-system/gallery';

export const metadata: Metadata = {
  title: 'Design system',
  robots: { index: false, follow: false },
};

/**
 * The design-system reference: every token and primitive, in whichever theme
 * you are viewing.
 *
 * It is deliberately not behind sign-in or an environment switch. It reads no
 * data and calls no API; everything on it is already public in the stylesheet
 * (a colour is a CSS custom property any visitor can read). Keeping it outside
 * the signed-in shell is what lets a designer or a reviewer open it from a
 * preview with no account and no seeded database. `noindex` keeps it out of
 * search. If a deployment wants it gone, deleting this folder is the whole change.
 */
export default function DesignSystemPage() {
  return <DesignSystemGallery />;
}
