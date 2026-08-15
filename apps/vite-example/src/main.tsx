import { createRoot } from 'react-dom/client';
import './index.css';

function App() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-slate-50 p-8 text-slate-950">
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-brand text-2xl text-white">N</div>
        <h1 className="mt-6 text-4xl font-bold tracking-tight">Vite + real browser DOM</h1>
        <span className="mt-4 block text-slate-600">
          Vite owns the browser bundle; Nitrowind contributes browser-safe Tailwind utilities only.
        </span>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
