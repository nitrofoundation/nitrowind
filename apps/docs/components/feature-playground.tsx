'use client';

export default function FeaturePlayground({ feature }: { feature: 'gradient' | 'mask' }) {
  const isGradient = feature === 'gradient';
  return (
    <section className="my-8 overflow-hidden rounded-xl border border-fd-border bg-fd-card">
      <div className="flex items-center justify-between border-b border-fd-border px-5 py-3 text-sm">
        <span className="font-medium">Interactive example</span>
        <span className="font-mono text-fd-muted-foreground">
          {isGradient ? 'Native gradient' : 'Native mask'}
        </span>
      </div>
      <div className="grid gap-5 p-5 md:grid-cols-2">
        <div
          className={
            isGradient
              ? 'min-h-44 rounded-lg bg-gradient-to-br from-cyan-400 via-blue-600 to-violet-700'
              : 'mask-preview flex min-h-44 items-center justify-center rounded-lg'
          }
        >
          <span className="rounded-md bg-black/30 px-3 py-2 text-sm font-medium text-white">
            {isGradient ? 'One className' : 'Native paint layer'}
          </span>
        </div>
        <div className="rounded-lg bg-zinc-950 p-4 font-mono text-sm leading-6 text-zinc-200">
          {isGradient ? (
            <>
              className=&quot;h-64 rounded-3xl
              <br />
              bg-linear-to-br from-cyan-400
              <br />
              via-blue-600 to-violet-700&quot;
            </>
          ) : (
            <>
              mask-image: radial-gradient(circle,
              <br />
              black 46%, transparent 68%);
              <br />
              mask-size: contain;
            </>
          )}
        </div>
      </div>
    </section>
  );
}
