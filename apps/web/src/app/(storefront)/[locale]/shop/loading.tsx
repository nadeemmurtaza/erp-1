export default function Loading() {
  return (
    <div className="container-page py-8 animate-fadeIn">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div className="flex-1">
          <div className="skeleton h-8 w-24 rounded-lg mb-2" />
          <div className="skeleton h-4 w-40 rounded" />
        </div>
        <div className="skeleton h-8 w-32 rounded-lg" />
      </div>

      <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
        {/* Filter skeleton */}
        <aside className="hidden lg:block">
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="border-t border-sand-200 py-4">
                <div className="skeleton h-4 w-20 rounded mb-3" />
                <div className="space-y-2">
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="skeleton h-3 w-24 rounded" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Products grid skeleton */}
        <div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="flex flex-col overflow-hidden rounded-lg border border-sand-200 bg-white">
                <div className="skeleton aspect-[3/4]" />
                <div className="flex-1 space-y-2 p-4">
                  <div className="skeleton h-4 w-full rounded" />
                  <div className="skeleton h-4 w-5/6 rounded" />
                  <div className="skeleton h-4 w-1/3 rounded mt-3" />
                </div>
              </div>
            ))}
          </div>

          {/* Pagination skeleton */}
          <div className="mt-8 flex items-center justify-between">
            <div className="skeleton h-8 w-20 rounded" />
            <div className="skeleton h-4 w-32 rounded" />
            <div className="skeleton h-8 w-20 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
