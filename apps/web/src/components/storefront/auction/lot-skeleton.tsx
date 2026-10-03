import { SkeletonRegion } from '@/components/ui';

/** The lot page's first-load placeholder: the title, then the panel and the history, in the boxes they will fill. */
export function LotPageSkeleton() {
  return (
    <SkeletonRegion className="container-page py-8 lg:py-12">
      <div className="skeleton h-4 w-24 rounded" />
      <div className="skeleton mt-5 h-3 w-48 rounded" />
      <div className="skeleton mt-3 h-8 w-80 max-w-full rounded-lg" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="card grid gap-5 p-5 lg:col-start-2 lg:row-start-1">
          <div className="skeleton h-12 w-48 rounded" />
          <div className="skeleton h-10 w-40 rounded" />
          <div className="skeleton h-14 w-full rounded-md" />
          <div className="skeleton h-12 w-full rounded-md" />
        </div>
        <div className="grid content-start gap-3 lg:col-start-1 lg:row-start-1">
          <div className="skeleton h-5 w-32 rounded" />
          <div className="skeleton h-4 w-full max-w-prose rounded" />
          <div className="skeleton h-4 w-5/6 max-w-prose rounded" />
        </div>
      </div>
    </SkeletonRegion>
  );
}
