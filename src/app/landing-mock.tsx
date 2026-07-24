/** Composição CSS que evoca o dashboard (decorativa — sem screenshot). */
export function LandingMock() {
  const barras = [42, 68, 55, 80, 62, 90, 74];
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none mx-auto w-full max-w-4xl select-none rounded-3xl border border-line bg-paper-1 p-4 shadow-[0_28px_70px_rgba(20,18,15,0.10)] sm:p-6"
    >
      <div className="mb-4 flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-ink/10" />
        <span className="h-2.5 w-2.5 rounded-full bg-ink/10" />
        <span className="h-2.5 w-2.5 rounded-full bg-brand/60" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-bg-elevated p-4 sm:col-span-2">
          <div className="mb-2 h-2 w-24 rounded bg-ink/10" />
          <div className="flex h-28 items-end gap-2">
            {barras.map((h, i) => (
              <div
                key={i}
                style={{ height: `${h}%` }}
                className={`flex-1 rounded-t ${i === barras.length - 2 ? 'bg-brand' : 'bg-brand/30'}`}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-line bg-bg-elevated p-4">
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full"
            style={{ background: 'conic-gradient(#137a3e 0% 76%, #e3ded4 76% 100%)' }}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-paper-2 font-heading text-2xl text-ink">
              76
            </div>
          </div>
          <div className="h-2 w-16 rounded bg-ink/10" />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <div className="h-6 w-28 rounded-full bg-brand-glow" />
        <div className="h-6 w-20 rounded-full bg-ink/5" />
        <div className="h-6 w-24 rounded-full bg-ink/5" />
      </div>
    </div>
  );
}
