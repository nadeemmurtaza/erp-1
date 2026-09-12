export default function Loading() {
  return (
    <div className="animate-fadeIn">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex-1">
          <div className="skeleton h-6 w-32 rounded mb-2" />
          <div className="skeleton h-3 w-48 rounded" />
        </div>
        <div className="skeleton h-10 w-28 rounded-md" />
      </div>

      {/* Stats tiles skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-4 animate-fadeIn" style={{ animationDelay: `${(i + 1) * 100}ms` }}>
            <div className="skeleton h-3 w-16 rounded mb-2" />
            <div className="skeleton h-7 w-24 rounded my-1" />
            <div className="skeleton h-2 w-20 rounded" />
          </div>
        ))}
      </div>

      {/* Attention alerts skeleton */}
      <div className="mt-4 flex flex-wrap gap-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="skeleton h-8 w-40 rounded-md" />
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="card mt-6 p-4 sm:p-5">
        <div className="mb-4 flex justify-between items-center">
          <div>
            <div className="skeleton h-4 w-16 rounded mb-2" />
            <div className="skeleton h-3 w-40 rounded" />
          </div>
          <div className="flex gap-1">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton h-8 w-16 rounded-md" />
            ))}
          </div>
        </div>
        <div className="skeleton h-56 rounded-lg" />
      </div>

      {/* Grid sections skeleton */}
      <div className="mt-6 grid gap-4 fold:grid-cols-2">
        {[...Array(2)].map((_, section) => (
          <div key={section} className="card p-4">
            <div className="skeleton h-4 w-32 rounded mb-4" />
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i}>
                  <div className="flex justify-between gap-3 mb-2">
                    <div className="skeleton h-3 w-3/5 rounded" />
                    <div className="skeleton h-3 w-20 rounded" />
                  </div>
                  <div className="skeleton h-2 w-full rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
