/**
 * The shape of the dashboard, before the dashboard.
 *
 * A skeleton is a promise about the layout, so it has to describe the layout
 * that actually arrives. This one still drew four bordered stat cards, a
 * boxed chart and a two-column grid — the page as it was before the metric
 * strip replaced all of it — so every load ended in a visible jump as the
 * real page rearranged itself.
 *
 * The stagger is `.stagger` rather than an inline animationDelay computed per
 * item: nothing about it depends on data.
 */
export default function Loading() {
  return (
    <div className="animate-fadeIn">
      {/* Page header: title, one line, one action. */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1">
          <div className="skeleton mb-2 h-6 w-40 rounded" />
          <div className="skeleton h-3 w-72 rounded" />
        </div>
        <div className="skeleton h-11 w-28 rounded" />
      </div>

      {/* Needs attention: chips that flow, never a grid with holes in it. */}
      <div className="mb-10">
        <div className="skeleton mb-3 h-3 w-28 rounded" />
        <div className="stagger flex flex-wrap gap-2">
          {[...Array(3)].map((_, index) => (
            <div key={index} className="skeleton h-11 flex-1 basis-64 rounded" />
          ))}
        </div>
      </div>

      {/* The metric strip: one surface, four cells, no borders between them. */}
      <div className="stagger mb-10 flex bg-neutral-50">
        {[...Array(4)].map((_, index) => (
          <div key={index} className="flex-1 px-4 py-4 lg:px-5 lg:py-5">
            <div className="skeleton mb-2 h-2.5 w-20 rounded" />
            <div className="skeleton h-8 w-24 rounded" />
            <div className="skeleton mt-2 h-2 w-16 rounded" />
          </div>
        ))}
      </div>

      {/* Two titled regions, no boxes. */}
      <div className="grid gap-8 fold:grid-cols-2">
        {[...Array(2)].map((_, section) => (
          <div key={section}>
            <div className="skeleton mb-3 h-3 w-32 rounded" />
            <div className="stagger space-y-2">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="flex justify-between gap-3">
                  <div className="skeleton h-3 w-3/5 rounded" />
                  <div className="skeleton h-3 w-12 rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
