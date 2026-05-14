"use client";

import ServerLights from "./ServerLights";
import type { AppSettings } from "@/lib/settings";

export default function Background({
  settings,
}: {
  settings: AppSettings;
}) {
  const bg = settings.background;

  if (bg.type === "lights") {
    return <ServerLights />;
  }

  if (bg.type === "color") {
    return (
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{ background: bg.color }}
      />
    );
  }

  if (bg.type === "gradient") {
    return (
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background: `linear-gradient(${bg.gradient.angle}deg, ${bg.gradient.from} 0%, ${bg.gradient.to} 100%)`,
        }}
      />
    );
  }

  if (bg.type === "image") {
    if (bg.image.dataUrl) {
      return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${bg.image.dataUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: `blur(${bg.image.blur}px)`,
              opacity: bg.image.opacity,
              transform: bg.image.blur > 0 ? "scale(1.06)" : undefined,
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.7) 90%)",
            }}
          />
        </div>
      );
    }
    return (
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{ background: bg.color }}
      />
    );
  }

  // video
  if (bg.video.src) {
    return (
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <video
          src={bg.video.src}
          autoPlay
          loop
          muted={bg.video.muted}
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            filter: `blur(${bg.video.blur}px)`,
            opacity: bg.video.opacity,
            transform: bg.video.blur > 0 ? "scale(1.06)" : undefined,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.7) 90%)",
          }}
        />
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
      style={{ background: bg.color }}
    />
  );
}
