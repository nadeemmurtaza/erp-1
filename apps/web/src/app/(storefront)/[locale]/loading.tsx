export default function Loading() {
  return (
    <div className="animate-fadeIn">
      {/* Hero section skeleton */}
      <section className="border-b border-neutral-100 bg-gradient-to-b from-neutral-50 to-neutral-50">
        <div className="container-page py-12 sm:py-20 lg:py-32">
          <div className="max-w-2xl">
            <div className="skeleton h-12 w-3/4 rounded-lg mb-4" />
            <div className="skeleton h-6 w-full rounded-lg mb-2" />
            <div className="skeleton h-6 w-5/6 rounded-lg mb-8" />
            <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
              <div className="skeleton h-10 w-full sm:w-40 rounded-md" />
              <div className="skeleton h-10 w-full sm:w-40 rounded-md" />
            </div>
          </div>
        </div>
      </section>

      {/* Categories skeleton */}
      <section className="container-page py-12">
        <div className="skeleton h-6 w-32 rounded-lg mb-6" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-28 rounded-lg" />
          ))}
        </div>
      </section>

      {/* Featured products skeleton */}
      <section className="container-page pb-12">
        <div className="skeleton h-6 w-32 rounded-lg mb-6" />
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex flex-col overflow-hidden rounded-lg border border-neutral-100 bg-white">
              <div className="skeleton aspect-square" />
              <div className="flex-1 space-y-2 p-4">
                <div className="skeleton h-4 w-full rounded" />
                <div className="skeleton h-4 w-5/6 rounded" />
                <div className="skeleton h-4 w-1/3 rounded mt-3" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works skeleton */}
      <section className="border-y border-neutral-100 bg-white">
        <div className="container-page py-12">
          <div className="skeleton h-6 w-32 rounded-lg mb-6" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="skeleton h-8 w-8 shrink-0 rounded-full" />
                <div className="flex-1">
                  <div className="skeleton h-4 w-full rounded mb-2" />
                  <div className="skeleton h-3 w-5/6 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
