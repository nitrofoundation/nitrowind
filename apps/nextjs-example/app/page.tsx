export const dynamic = 'force-static';

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-slate-50 p-8 text-slate-950">
      <article className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <img
          alt="Nitrowind logo placeholder"
          className="size-16 rounded-2xl bg-brand p-3"
          src="/logo.svg"
        />
        <p className="mt-6 text-sm font-semibold tracking-wide text-brand">SERVER COMPONENT</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">Real HTML, zero Nitrowind runtime</h1>
        <span className="mt-4 block text-slate-600">
          This page renders standard DOM elements and Tailwind CSS on the server.
        </span>
      </article>
    </main>
  );
}
