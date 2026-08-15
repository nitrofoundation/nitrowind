export default function WebHomePage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-slate-50 p-8 text-slate-950">
      <article className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-brand text-2xl text-white">N</div>
        <h1 className="mt-6 text-4xl font-bold tracking-tight">Expo web uses real HTML</h1>
        <span className="mt-4 block text-slate-600">
          This `.web.tsx` route keeps div, article, and span as DOM elements for browser rendering.
        </span>
      </article>
    </main>
  );
}
