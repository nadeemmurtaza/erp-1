export default function Loading() {
  return (
    <div className="container-page py-8 lg:py-12 animate-fadeIn">
      <div className="skeleton h-8 w-40 rounded-lg" />
      <div className="skeleton mt-3 h-4 w-72 max-w-full rounded" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="card flex min-h-[10rem] flex-col gap-3 p-5">
            <div className="skeleton h-3 w-2/5 rounded" />
            <div className="skeleton h-4 w-4/5 rounded" />
            <div className="skeleton mt-2 h-6 w-1/3 rounded" />
            <div className="skeleton mt-auto h-3 w-3/5 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
