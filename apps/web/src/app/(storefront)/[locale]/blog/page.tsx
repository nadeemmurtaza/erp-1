import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getPosts } from '@/lib/api';
import { alternateLanguages, canonicalUrl } from '@/config/seo';
import { ROUTES } from '@/constants/routes';

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: 'Blog',
    alternates: { canonical: canonicalUrl('/blog', locale), languages: alternateLanguages('/blog') },
  };
}

/** WO-8.1 — the blog index. Empty state matters: most stores start with zero posts. */
export default async function BlogIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { data: posts } = await getPosts(locale);

  return (
    <div className="container-page py-10 sm:py-14">
      <h1 className="font-display mb-8 text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">Blog</h1>

      {posts.length === 0 ? (
        <p className="text-sm text-neutral-500">Nothing published yet — check back soon.</p>
      ) : (
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Link key={post.id} href={ROUTES.storefront.blogPost(post.slug)} className="group block">
              {post.heroImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- CMS-uploaded, unconstrained domain
                <img
                  src={post.heroImageUrl}
                  alt={post.translation?.title ?? ''}
                  className="mb-4 aspect-video w-full rounded-md object-cover"
                />
              ) : null}
              <h2 className="font-medium text-neutral-900 group-hover:underline">{post.translation?.title}</h2>
              {post.translation?.excerpt ? (
                <p className="mt-2 line-clamp-2 text-sm text-neutral-500">{post.translation.excerpt}</p>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
