export default function Loading() {
  return (
    <div className="container-page py-8 animate-fadeIn">
      <div className="skeleton h-8 w-32 rounded-lg mb-8" />

      <form className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        {/* Form sections skeleton */}
        <div className="space-y-6">
          {[...Array(3)].map((_, section) => (
            <div key={section} className="card p-4 sm:p-5">
              <div className="skeleton h-4 w-32 rounded mb-4" />
              <div className="grid gap-4 sm:grid-cols-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className={section === 1 ? 'sm:col-span-2' : ''}>
                    <div className="skeleton h-3 w-20 rounded mb-2" />
                    <div className="skeleton h-8 rounded-md w-full" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Summary skeleton */}
        <aside className="card h-fit p-4 lg:sticky lg:top-24">
          <div className="skeleton h-4 w-16 rounded mb-4" />
          <div className="mt-3 space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex justify-between">
                <div className="skeleton h-3 w-24 rounded" />
                <div className="skeleton h-3 w-16 rounded" />
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-sand-200 pt-4">
            <div className="flex justify-between mb-4">
              <div className="skeleton h-3 w-12 rounded" />
              <div className="skeleton h-5 w-20 rounded" />
            </div>
            <div className="skeleton h-10 w-full rounded-md" />
          </div>
        </aside>
      </form>
    </div>
  );
}
