/** Composição CSS que evoca o dashboard (decorativa — sem screenshot). */
export function LandingMock() {
  const barras = [42, 68, 55, 80, 62, 90, 74];
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none mx-auto w-full max-w-3xl select-none rounded-2xl border border-strong bg-bg-surface p-4 shadow-glow-3 sm:p-6"
    >
      <div className="mb-4 flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
        <span className="h-2.5 w-2.5 rounded-full bg-brand/60" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-bg-elevated p-4 sm:col-span-2">
          <div className="mb-2 h-2 w-24 rounded bg-white/10" />
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
            style={{ background: 'conic-gradient(#07dd2b 0% 76%, rgba(255,255,255,0.06) 76% 100%)' }}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bg-elevated font-mono text-xl font-bold text-white">
              76
            </div>
          </div>
          <div className="h-2 w-16 rounded bg-white/10" />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <div className="h-6 w-28 rounded-full bg-brand-glow" />
        <div className="h-6 w-20 rounded-full bg-white/5" />
        <div className="h-6 w-24 rounded-full bg-white/5" />
      </div>
    </div>
  );
}
