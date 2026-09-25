/**
 * The shape of the dashboard, before the dashboard.
 *
 * A skeleton is a promise about the layout, so it has to describe the layout
 * that actually arrives. Rebuilt for WO-A.4's card-registry dashboard: nine
 * collapsed group rows, not the four-cell metric strip and two titled lists
 * this page carried before the rebuild — that shape stopped arriving, so
 * drawing it here would end every load in a visible jump as the real page
 * rearranged itself.
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
      <div className="mb-6">
        <div className="skeleton mb-3 h-3 w-28 rounded" />
        <div className="stagger flex flex-wrap gap-2">
          {[...Array(3)].map((_, index) => (
            <div key={index} className="skeleton h-11 flex-1 basis-64 rounded" />
          ))}
        </div>
      </div>

      {/* Range picker, right-aligned. */}
      <div className="mb-4 flex justify-end">
        <div className="skeleton h-9 w-64 rounded" />
      </div>

      {/* Nine collapsed group rows — a heading, a headline figure, a chevron. Each is `.card`, so the skeleton draws the same single soft border the real row does. */}
      <div className="stagger flex flex-col gap-3">
        {[...Array(9)].map((_, index) => (
          <div key={index} className="card flex items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-2">
              <div className="skeleton h-4 w-4 rounded" />
              <div className="skeleton h-3 w-28 rounded" />
            </div>
            <div className="flex items-center gap-3">
              <div className="skeleton hidden h-3 w-32 rounded sm:block" />
              <div className="skeleton h-6 w-6 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
