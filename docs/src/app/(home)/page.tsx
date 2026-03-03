import {
  BookOpen,
  Box,
  Bot,
  ExternalLink,
  Layers,
  Lock,
  Wrench,
} from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="relative overflow-hidden bg-background">
      {/* Hero Section */}
      <section className="relative grid-bg min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-6 py-24 text-center">
        {/* Radial amber glow */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[600px]"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(200,169,126,0.12) 0%, transparent 70%)",
          }}
        />

        {/* Eyebrow */}
        <p
          className="animate-fade-up mb-6 tracking-[0.35em] text-xs uppercase"
          style={{ color: "#c8a97e", fontFamily: "var(--font-mono)" }}
        >
          Telaio
        </p>

        {/* H1 */}
        <h1
          className="animate-fade-up animation-delay-100 relative z-10 max-w-3xl text-6xl leading-[1.05] font-semibold tracking-tight md:text-7xl text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Build backends
          <br />
          <span style={{ color: "#c8a97e" }}>with certainty.</span>
        </h1>

        {/* Subheadline */}
        <p
          className="animate-fade-up animation-delay-200 mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground"
          style={{ fontFamily: "var(--font-body)" }}
        >
          The hard decisions are already made. PostgreSQL, Redis, queues, auth,
          email — pre-chosen, pre-typed, pre-wired. Skip the configuration. Ship
          the product.
        </p>

        {/* CTAs */}
        <div className="animate-fade-up animation-delay-300 mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
            style={{
              background: "#c8a97e",
              color: "#09090b",
              fontFamily: "var(--font-body)",
            }}
          >
            <BookOpen size={15} />
            Get Started
            <span aria-hidden="true">→</span>
          </Link>
          <a
            href="https://github.com/niranjan94/telaio"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-colors hover:border-[#c8a97e] border border-border text-foreground"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <ExternalLink size={15} />
            View on GitHub
          </a>
        </div>

        {/* Code snippet */}
        <div className="animate-fade-up animation-delay-400 relative mt-12 w-full max-w-lg overflow-hidden rounded-lg text-left bg-muted border border-border">
          {/* Dot bar */}
          <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border">
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
          </div>
          <pre
            className="overflow-x-auto p-5 text-[13px] leading-relaxed text-muted-foreground"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            <code>
              <span style={{ color: "#78716c" }}>{"// app.ts\n"}</span>
              <span style={{ color: "#a1a1aa" }}>{"const app = await "}</span>
              <span style={{ color: "#c8a97e" }}>{"createApp"}</span>
              <span style={{ color: "#a1a1aa" }}>{"(config)\n"}</span>
              <span style={{ color: "#a1a1aa" }}>{"  ."}</span>
              <span style={{ color: "#c8a97e" }}>{"withDatabase"}</span>
              <span style={{ color: "#a1a1aa" }}>{"()\n"}</span>
              <span style={{ color: "#a1a1aa" }}>{"  ."}</span>
              <span style={{ color: "#c8a97e" }}>{"withCache"}</span>
              <span style={{ color: "#a1a1aa" }}>{"()\n"}</span>
              <span style={{ color: "#a1a1aa" }}>{"  ."}</span>
              <span style={{ color: "#c8a97e" }}>{"withQueue"}</span>
              <span style={{ color: "#a1a1aa" }}>{"(queues)\n"}</span>
              <span style={{ color: "#a1a1aa" }}>{"  ."}</span>
              <span style={{ color: "#c8a97e" }}>{"build"}</span>
              <span style={{ color: "#a1a1aa" }}>{"()\n\n"}</span>
              <span style={{ color: "#78716c" }}>
                {"// Database, cache, queues — wired.\n"}
              </span>
              <span style={{ color: "#78716c" }}>
                {"// No decisions. Just build."}
              </span>
            </code>
          </pre>
        </div>
      </section>

      {/* Divider */}
      <div className="mx-auto max-w-5xl px-6">
        <hr className="border-border" />
      </div>

      {/* Three Pillars */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <PillarCard
            icon={<Lock size={18} style={{ color: "#c8a97e" }} />}
            heading="Phantom Types"
            delay="animation-delay-100"
          >
            Feature flags live in the type system. If{" "}
            <code
              className="rounded px-1 text-xs bg-muted"
              style={{
                color: "#c8a97e",
                fontFamily: "var(--font-mono)",
              }}
            >
              .withCache()
            </code>{" "}
            was never called,{" "}
            <code
              className="rounded px-1 text-xs bg-muted"
              style={{
                color: "#c8a97e",
                fontFamily: "var(--font-mono)",
              }}
            >
              app.cache
            </code>{" "}
            doesn't exist at compile time — no runtime guards needed.
          </PillarCard>

          <PillarCard
            icon={<Layers size={18} style={{ color: "#c8a97e" }} />}
            heading="Builder Pattern"
            delay="animation-delay-200"
          >
            Compose exactly the features you need. Every{" "}
            <code
              className="rounded px-1 text-xs bg-muted"
              style={{
                color: "#c8a97e",
                fontFamily: "var(--font-mono)",
              }}
            >
              .with*()
            </code>{" "}
            call returns a narrower type. Unused modules don't exist in your
            build or your types.
          </PillarCard>

          <PillarCard
            icon={<Box size={18} style={{ color: "#c8a97e" }} />}
            heading="Opinionated Stack"
            delay="animation-delay-300"
          >
            PostgreSQL via Kysely. Redis. pg-boss. Pino. TypeBox. Every pairing
            is pre-typed and pre-wired. Zero config overhead for decisions
            already made.
          </PillarCard>

          <PillarCard
            icon={<Bot size={18} style={{ color: "#c8a97e" }} />}
            heading="AI-Ready by Design"
            delay="animation-delay-400"
          >
            A fixed stack and phantom types mean LLM agents work with your
            business logic, not infrastructure plumbing. Compile-time errors
            catch AI mistakes before runtime.
          </PillarCard>
        </div>
      </section>

      {/* Divider */}
      <div className="mx-auto max-w-5xl px-6">
        <hr className="border-border" />
      </div>

      {/* The Stack */}
      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <h2
          className="animate-fade-up mb-3 text-3xl font-semibold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          One stack. <span style={{ color: "#c8a97e" }}>Zero compromises.</span>
        </h2>
        <p
          className="animate-fade-up animation-delay-100 mb-12 text-sm text-muted-foreground/60"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Every pairing is pre-typed, pre-wired, and battle-tested.
        </p>

        <div className="animate-fade-up animation-delay-200 flex flex-wrap justify-center gap-2.5">
          {[
            "Fastify 5",
            "PostgreSQL",
            "Kysely",
            "Redis",
            "pg-boss",
            "Pino",
            "TypeBox",
            "Zod",
            "AWS SDK",
            "React Email",
            "Better Auth",
            "TypeScript",
          ].map((tech) => (
            <span
              key={tech}
              className="rounded-full px-3.5 py-1.5 text-xs font-medium bg-card border border-border text-muted-foreground"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {tech}
            </span>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div className="mx-auto max-w-5xl px-6">
        <hr className="border-border" />
      </div>

      {/* Quick Start */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <div className="flex items-center gap-3 mb-3">
          <Wrench size={18} style={{ color: "#c8a97e" }} />
          <h2
            className="animate-fade-up text-3xl font-semibold tracking-tight text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Quick Start
          </h2>
        </div>
        <p
          className="animate-fade-up animation-delay-100 mb-8 text-sm text-muted-foreground/60"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Up and running in under a minute.
        </p>

        <div className="animate-fade-up animation-delay-200 overflow-hidden rounded-lg bg-muted border border-border">
          {/* Tab bar */}
          <div className="flex items-center gap-0 border-b border-border">
            <div
              className="px-4 py-3 text-xs font-medium"
              style={{
                color: "#c8a97e",
                borderBottom: "2px solid #c8a97e",
                fontFamily: "var(--font-mono)",
              }}
            >
              CLI (recommended)
            </div>
          </div>
          <pre
            className="overflow-x-auto p-5 text-[13px] leading-relaxed text-muted-foreground"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            <code>
              <span style={{ color: "#78716c" }}>
                {"# Scaffold a new project\n"}
              </span>
              <span style={{ color: "#c8a97e" }}>{"pnpx telaio init"}</span>
              <span style={{ color: "#a1a1aa" }}>{" my-app\n"}</span>
              <span style={{ color: "#c8a97e" }}>{"cd"}</span>
              <span style={{ color: "#a1a1aa" }}>{" my-app\n"}</span>
              <span style={{ color: "#c8a97e" }}>{"pnpm install"}</span>
              <span style={{ color: "#a1a1aa" }}>{"\n"}</span>
              <span style={{ color: "#c8a97e" }}>{"pnpm run dev"}</span>
            </code>
          </pre>
        </div>

        <div className="animate-fade-up animation-delay-300 mt-6 flex gap-4">
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 text-sm transition-colors hover:opacity-80"
            style={{ color: "#c8a97e", fontFamily: "var(--font-body)" }}
          >
            Read the full docs
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      {/* Divider */}
      <div className="mx-auto max-w-5xl px-6">
        <hr className="border-border" />
      </div>

      {/* Footer strip */}
      <footer className="mx-auto max-w-5xl px-6 py-12 text-center">
        <p
          className="text-sm text-muted-foreground/60"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Telaio — named after the loom. Type every thread.{"  "}
          <Link
            href="/docs"
            className="underline underline-offset-2 transition-colors hover:opacity-80 text-muted-foreground"
          >
            Docs
          </Link>
          {"  ·  "}
          <a
            href="https://github.com/niranjan94/telaio"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition-colors hover:opacity-80 text-muted-foreground"
          >
            GitHub
          </a>
        </p>
      </footer>
    </main>
  );
}

function PillarCard({
  icon,
  heading,
  delay,
  children,
}: {
  icon: React.ReactNode;
  heading: string;
  delay: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`animate-fade-up ${delay} rounded-lg p-6 bg-card border border-border`}
    >
      <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-md bg-muted">
        {icon}
      </div>
      <h3
        className="mb-2 text-base font-semibold text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {heading}
      </h3>
      <p
        className="text-sm leading-relaxed text-muted-foreground"
        style={{ fontFamily: "var(--font-body)" }}
      >
        {children}
      </p>
    </div>
  );
}
