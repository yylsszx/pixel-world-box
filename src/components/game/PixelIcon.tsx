'use client';
// ============ Renders an 8x8 bitmap icon as crisp pixel art ============
import { useEffect, useRef } from 'react';
import { ICONS, PIX } from '@/lib/game/constants';

interface Props {
  icon: string;
  size?: number;
  className?: string;
}

export function PixelIcon({ icon, size = 22, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const rows = ICONS[icon];
    const ctx = cv.getContext('2d');
    if (!ctx || !rows) return;
    ctx.clearRect(0, 0, 8, 8);
    for (let y = 0; y < rows.length && y < 8; y++) {
      for (let x = 0; x < rows[y].length && x < 8; x++) {
        const ch = rows[y][x];
        const color = PIX[ch];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }, [icon]);

  return (
    <canvas
      ref={ref}
      width={8}
      height={8}
      className={className}
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
      aria-hidden
    />
  );
}
