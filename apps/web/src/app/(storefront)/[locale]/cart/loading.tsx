export default function Loading() {
  return (
    <div className="container-page py-8 animate-fadeIn">
      <div className="skeleton h-8 w-24 rounded-lg mb-8" />

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        {/* Cart items skeleton */}
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card flex gap-4 p-4">
              <div className="skeleton h-28 w-20 shrink-0 rounded" />
              <div className="min-w-0 flex-1">
                <div className="skeleton h-4 w-full rounded mb-2" />
                <div className="skeleton h-3 w-3/4 rounded" />
                <div className="mt-3 space-y-1">
                  <div className="skeleton h-3 w-full rounded" />
                  <div className="skeleton h-3 w-4/5 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary skeleton */}
        <div className="card h-fit p-4">
          <div className="skeleton h-4 w-16 rounded mb-4" />
          <div className="mt-4 space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex justify-between">
                <div className="skeleton h-3 w-24 rounded" />
                <div className="skeleton h-3 w-16 rounded" />
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-neutral-100 pt-4">
            <div className="flex justify-between mb-4">
              <div className="skeleton h-4 w-16 rounded" />
              <div className="skeleton h-6 w-24 rounded" />
            </div>
            <div className="skeleton h-10 w-full rounded-md" />
            <div className="skeleton h-4 w-full rounded-md mt-3" />
          </div>
        </div>
      </div>
    </div>
  );
}
