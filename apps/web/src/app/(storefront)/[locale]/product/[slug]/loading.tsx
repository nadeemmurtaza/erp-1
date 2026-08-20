export default function Loading() {
  return (
    <div className="container-page py-8 animate-fadeIn">
      <div className="mb-6 text-sm text-ink/60">
        <div className="skeleton h-4 w-32 rounded inline-block" />
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* Gallery skeleton */}
        <div>
          <div className="flex flex-col-reverse lg:flex-row gap-4">
            {/* Thumbnails */}
            <div className="flex lg:flex-col gap-2 overflow-x-auto pb-1 lg:pb-0 lg:h-[400px] lg:max-h-[800px] shrink-0">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="skeleton h-20 w-16 shrink-0 rounded" />
              ))}
            </div>

            {/* Main image */}
            <div className="skeleton aspect-[3/4] flex-1 rounded-lg" />
          </div>
        </div>

        {/* Details skeleton */}
        <div>
          <div className="skeleton h-8 w-full rounded-lg mb-4" />

          <div className="mt-6">
            <div className="skeleton h-8 w-32 rounded-lg mb-3" />
            <div className="skeleton h-4 w-24 rounded mb-6" />

            {/* Options skeleton */}
            <div className="space-y-6">
              <div>
                <div className="skeleton h-4 w-20 rounded mb-3" />
                <div className="flex flex-wrap gap-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="skeleton h-8 w-16 rounded" />
                  ))}
                </div>
              </div>

              <div>
                <div className="skeleton h-4 w-20 rounded mb-3" />
                <div className="flex flex-wrap gap-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="skeleton h-8 w-12 rounded" />
                  ))}
                </div>
              </div>

              {/* Stitching panel skeleton */}
              <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
                <div className="skeleton h-4 w-32 rounded mb-4" />
              </div>

              {/* Add to cart button */}
              <div className="flex gap-3">
                <div className="skeleton h-10 w-24 rounded" />
                <div className="skeleton h-10 flex-1 rounded" />
              </div>
            </div>
          </div>

          {/* Description skeleton */}
          <div className="mt-8 border-t border-sand-200 pt-6">
            <div className="skeleton h-4 w-20 rounded mb-3" />
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="skeleton h-3 w-full rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
