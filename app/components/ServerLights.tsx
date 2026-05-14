"use client";

import { useMemo } from "react";

const COLORS = [
  { color: "#22c55e", weight: 50 }, // green
  { color: "#f59e0b", weight: 22 }, // amber
  { color: "#38bdf8", weight: 18 }, // sky blue
  { color: "#ef4444", weight: 5 },  // red
  { color: "#a78bfa", weight: 5 },  // violet
];

const TOTAL_WEIGHT = COLORS.reduce((s, c) => s + c.weight, 0);

function pickColor(rand: number): string {
  let cum = 0;
  const target = rand * TOTAL_WEIGHT;
  for (const c of COLORS) {
    cum += c.weight;
    if (target < cum) return c.color;
  }
  return COLORS[0].color;
}

// Mulberry32: deterministic PRNG so SSR + client agree.
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Light = {
  top: string;
  left: string;
  size: number;
  color: string;
  delay: string;
  duration: string;
  blur: number;
  baseOpacity: number;
};

function generateLights(count: number, seed: number): Light[] {
  const rand = mulberry32(seed);
  const lights: Light[] = [];
  for (let i = 0; i < count; i++) {
    const sizeRand = rand();
    const size = sizeRand < 0.7 ? 2 : sizeRand < 0.95 ? 3 : 5;
    lights.push({
      top: `${(rand() * 100).toFixed(2)}%`,
      left: `${(rand() * 100).toFixed(2)}%`,
      size,
      color: pickColor(rand()),
      delay: `${(rand() * 4).toFixed(2)}s`,
      duration: `${(1.4 + rand() * 3.2).toFixed(2)}s`,
      blur: size >= 5 ? 2 : 0,
      baseOpacity: 0.35 + rand() * 0.45,
    });
  }
  return lights;
}

export default function ServerLights() {
  const lights = useMemo(() => generateLights(180, 1729), []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at 50% 50%, rgba(15, 20, 30, 0.95) 0%, #030305 75%)",
      }}
    >
      {/* Subtle vertical "rack" stripes to suggest server columns */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, transparent 0 80px, rgba(255,255,255,0.025) 80px 81px)",
        }}
      />
      {/* Horizontal scanline for CRT/server-room feel */}
      <div
        className="absolute inset-0 opacity-30 mix-blend-overlay"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.015) 0 2px, transparent 2px 4px)",
        }}
      />

      {lights.map((l, i) => (
        <span
          key={i}
          className="absolute rounded-full sl-light"
          style={{
            top: l.top,
            left: l.left,
            width: `${l.size}px`,
            height: `${l.size}px`,
            backgroundColor: l.color,
            boxShadow: `0 0 ${l.size * 2}px ${l.color}`,
            filter: l.blur ? `blur(${l.blur}px)` : undefined,
            animationDelay: l.delay,
            animationDuration: l.duration,
            // Pass base opacity through CSS variable for keyframes.
            ["--sl-opacity" as string]: l.baseOpacity.toString(),
            opacity: l.baseOpacity,
          }}
        />
      ))}

      <style>{`
        @keyframes sl-blink {
          0%, 100% { opacity: calc(var(--sl-opacity) * 0.25); }
          50% { opacity: var(--sl-opacity); }
        }
        .sl-light {
          animation-name: sl-blink;
          animation-iteration-count: infinite;
          animation-timing-function: ease-in-out;
        }
      `}</style>
    </div>
  );
}
