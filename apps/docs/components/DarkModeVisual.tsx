'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, useState } from 'react';

type ThemeChoice = 'light' | 'dark' | 'adaptive' | 'ocean';

export default function DarkModeVisual() {
  const drag = useRef<HTMLDivElement>(null);
  const maskRef1 = useRef<HTMLDivElement>(null);
  const maskRef2 = useRef<HTMLDivElement>(null);
  const dragbgRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [dx, setDX] = useState('50%');
  const [theme, setTheme] = useState<ThemeChoice>('adaptive');

  const updatePosition = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const xPercent = Math.min(100, Math.max(0, (x / rect.width) * 100));
    const percentStr = `${xPercent.toFixed(2)}%`;
    setDX(percentStr);
    setTheme('adaptive');
  };

  const selectTheme = (nextTheme: ThemeChoice) => {
    setTheme(nextTheme);
    setDX(nextTheme === 'light' ? '0%' : nextTheme === 'dark' ? '100%' : '50%');
  };

  return (
    <div
      className="dark-mode-visual group relative w-full h-full -z-20"
      data-theme={theme}
      ref={containerRef}
      onClick={e => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onPointerCancel={() => setIsDragging(false)}
      onPointerMove={e => {
        if (isDragging) updatePosition(e.clientX);
      }}
      onPointerUp={() => setIsDragging(false)}
    >
      <div className="dark-mode-toolbar" aria-label="Theme preview" role="group">
        {(['light', 'dark', 'adaptive', 'ocean'] as const).map(option => (
          <button
            aria-pressed={theme === option}
            className={theme === option ? 'is-active' : ''}
            key={option}
            onClick={() => selectTheme(option)}
            type="button"
          >
            {option === 'ocean' ? 'data-theme' : option}
          </button>
        ))}
      </div>
      <span className="dark-mode-theme-label">
        {theme === 'ocean' ? '[data-theme="ocean"]' : `${theme} runtime`}
      </span>
      <div
        ref={maskRef1}
        id="drag"
        className="flex flex-col justify-end p-4 gap-4 w-full h-full bg-neutral-900/50 group-hover:bg-neutral-900 max-md:bg-neutral-900 pt-8 duration-300 transition-colors"
        style={{
          WebkitMaskImage: 'linear-gradient(to right, transparent 50%, red 50%)',
          WebkitMaskSize: '200% 100%',
          WebkitMaskPosition: `-${dx} 0%`,
        }}
      >
        <div className="group-hover:bg-cyan-500/30 bg-cyan-400/3 border border-dashed group-hover:border-cyan-400/20 max-md:border-cyan-400/20 duration-300 rounded-full w-10 h-10" />
        <div className="group-hover:bg-cyan-500/20 bg-cyan-400/2 border border-dashed group-hover:border-cyan-400/20 max-md:border-cyan-400/20 duration-300 rounded-xl p-4 w-full h-[69%]" />
        <div className="flex gap-4 justify-end">
          <div className="bg-black/5 group-hover:bg-cyan-500/15 dark:bg-cyan-400/5 border border-dashed group-hover:border-cyan-400/20 max-md:border-cyan-400/20 duration-300 rounded-xl w-12 h-8" />
          <div className="bg-black/5 group-hover:bg-cyan-500/15 dark:bg-cyan-400/5 border border-dashed group-hover:border-cyan-400/20 max-md:border-cyan-400/20 duration-300 rounded-xl w-12 h-8" />
        </div>
      </div>

      <div
        ref={dragbgRef}
        className="absolute left-1/2 top-1/2 -translate-1/2 w-8 h-8 animate-ping rounded-full bg-fd-primary z-10"
        style={{
          left: dx,
        }}
      />
      <div
        ref={drag}
        className="absolute top-1/2 left-1/2 -translate-1/2 h-8 w-8 flex justify-center items-center rounded-full bg-fd-primary text-fd-foreground z-20 touch-none"
        onPointerDown={e => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          setIsDragging(true);
        }}
        style={{
          left: dx,
        }}
      >
        <ChevronLeft className="w-8 h-8 text-neutral-900/80 group-hover:text-neutral-900" />
        <ChevronRight className="w-8 h-8 text-neutral-100/80 group-hover:text-neutral-100" />
      </div>

      <div
        ref={maskRef2}
        className="flex flex-col justify-end p-4 gap-4 w-full h-full bg-neutral-100/50 group-hover:bg-neutral-100 absolute inset-0 duration-300 transition-colors pt-8 max-md:bg-neutral-100"
        style={{
          WebkitMaskImage: 'linear-gradient(to right, red 50%, transparent 50%)',
          WebkitMaskSize: '200% 100%',
          WebkitMaskPosition: `-${dx} 0%`,
        }}
      >
        <div className="group-hover:bg-cyan-500/30 bg-black/5 border border-dashed group-hover:border-cyan-400/20 max-md:border-cyan-400/20 duration-300 rounded-full w-10 h-10" />
        <div className="bg-black/5 group-hover:bg-cyan-500/20 border border-dashed group-hover:border-cyan-400/20 max-md:border-cyan-400/20 duration-300 rounded-xl p-4 w-full h-[69%]" />
        <div className="flex gap-4 justify-end">
          <div className="bg-black/5 group-hover:bg-cyan-500/15 border border-dashed group-hover:border-cyan-400/20 max-md:border-cyan-400/20 duration-300 rounded-xl w-12 h-8" />
          <div className="bg-black/5 group-hover:bg-cyan-500/15 border border-dashed group-hover:border-cyan-400/20 max-md:border-cyan-400/20 duration-300 rounded-xl w-12 h-8" />
        </div>
      </div>
    </div>
  );
}
