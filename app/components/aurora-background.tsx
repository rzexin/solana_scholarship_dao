"use client";

export function AuroraBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden="true"
    >
      <div
        className="absolute -top-32 -left-24 size-[40rem] rounded-full opacity-70 blur-3xl animate-float"
        style={{
          background:
            "radial-gradient(circle, rgba(255,232,194,0.85) 0%, rgba(244,162,97,0.35) 40%, transparent 70%)",
        }}
      />
      <div
        className="absolute -top-16 right-[-10rem] size-[36rem] rounded-full opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(228,210,255,0.85) 0%, rgba(157,78,221,0.30) 40%, transparent 70%)",
          animation: "float-slow 7s ease-in-out infinite reverse",
        }}
      />
      <div
        className="absolute bottom-[-12rem] left-1/3 size-[44rem] rounded-full opacity-55 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(190,237,250,0.8) 0%, rgba(72,191,227,0.28) 40%, transparent 70%)",
          animation: "float-slow 8s ease-in-out infinite",
        }}
      />

      <div
        className="absolute inset-0 opacity-25"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(244,162,97,0.18) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(244,162,97,0.18) 1px, transparent 1px)
          `,
          backgroundSize: "44px 44px",
          mask: "radial-gradient(ellipse 60% 60% at 50% 30%, black 30%, transparent 75%)",
          WebkitMask:
            "radial-gradient(ellipse 60% 60% at 50% 30%, black 30%, transparent 75%)",
        }}
      />
    </div>
  );
}
