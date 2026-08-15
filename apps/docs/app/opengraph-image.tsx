import { ImageResponse } from 'next/og';

export const alt = 'Nitrowind — Tailwind CSS v4 for React Native';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: 'center',
        background: '#090b0d',
        backgroundImage:
          'radial-gradient(circle at 78% 22%, rgba(43,217,255,.28), transparent 34%), linear-gradient(rgba(255,255,255,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.055) 1px, transparent 1px)',
        backgroundSize: 'auto, 48px 48px, 48px 48px',
        color: '#f7fbff',
        display: 'flex',
        height: '100%',
        justifyContent: 'center',
        padding: '64px',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '980px' }}>
        <div style={{ color: '#5ee5ff', display: 'flex', fontSize: 26, letterSpacing: 5 }}>
          NITROWIND · NATIVE FIRST
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 78,
            fontWeight: 800,
            letterSpacing: -4,
            lineHeight: 1.03,
            marginTop: 28,
          }}
        >
          Tailwind CSS v4 for React Native.
        </div>
        <div
          style={{
            color: '#aab8c4',
            display: 'flex',
            fontSize: 30,
            lineHeight: 1.4,
            marginTop: 30,
          }}
        >
          Native themes, responsive state, paint effects, and animations—powered below React.
        </div>
      </div>
    </div>,
    size,
  );
}
