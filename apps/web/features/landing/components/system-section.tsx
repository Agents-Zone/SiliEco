"use client";

import { ArrowDown, CheckCircle2 } from "lucide-react";
import { useLocale } from "../i18n";

export function SystemSection() {
  const { t } = useLocale();

  return (
    <section
      id="architecture"
      className="relative overflow-hidden bg-[#f4f6f9] text-[#0a0d12]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-45 [background-image:linear-gradient(to_right,rgba(10,13,18,0.055)_1px,transparent_1px),linear-gradient(to_bottom,rgba(10,13,18,0.055)_1px,transparent_1px)] [background-size:48px_48px]"
      />

      <div className="relative mx-auto grid max-w-[1320px] gap-14 px-4 py-24 sm:px-6 sm:py-32 lg:grid-cols-[0.78fr_1.22fr] lg:gap-24 lg:px-8 lg:py-40">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="text-micro font-semibold uppercase tracking-[0.18em] text-[#3978f6]">
            {t.system.label}
          </p>
          <h2 className="mt-5 max-w-[620px] text-[2.6rem] font-semibold leading-[0.98] tracking-[-0.045em] sm:text-[3.5rem] lg:text-[4.35rem]">
            {t.system.headline}
          </h2>
          <p className="mt-7 max-w-[560px] text-body-lg leading-8 text-[#0a0d12]/62 sm:text-title-sm">
            {t.system.description}
          </p>

          <div className="mt-10 border-l-2 border-[#3978f6] pl-5">
            <p className="text-label font-semibold text-[#0a0d12]">
              {t.system.flowLabel}
            </p>
            <ol className="mt-4 flex flex-col gap-3">
              {t.system.flow.map((step, index) => (
                <li
                  key={step}
                  className="flex items-center gap-3 text-body text-[#0a0d12]/58"
                >
                  <span className="font-mono text-micro text-[#3978f6]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="relative">
          <div
            aria-hidden
            className="absolute bottom-8 left-[39px] top-8 w-px bg-[#3978f6]/28 sm:left-[55px]"
          />
          <div className="flex flex-col">
            {t.system.layers.map((layer, index) => (
              <div key={layer.name}>
                <article className="relative grid gap-6 border border-[#0a0d12]/10 bg-white/90 p-6 shadow-[0_24px_80px_rgba(20,35,60,0.08)] backdrop-blur sm:grid-cols-[88px_1fr] sm:p-8">
                  <div className="relative z-10 flex size-16 items-center justify-center bg-[#0b0d12] font-mono text-label font-semibold tracking-[0.12em] text-white sm:size-20">
                    {layer.name}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <h3 className="text-title-lg font-semibold tracking-[-0.025em]">
                        {layer.label}
                      </h3>
                      <span className="border border-[#3978f6]/24 bg-[#3978f6]/6 px-2.5 py-1 font-mono text-micro text-[#255fcb]">
                        {layer.detail}
                      </span>
                    </div>
                    <p className="mt-3 max-w-[620px] text-body-lg leading-7 text-[#0a0d12]/58">
                      {layer.description}
                    </p>
                    <div className="mt-5 flex items-center gap-2 text-caption font-medium text-[#0a0d12]/40">
                      <CheckCircle2 className="size-4 text-[#3978f6]" />
                      <span>Silieco / {layer.name.toLowerCase()}</span>
                    </div>
                  </div>
                </article>
                {index < t.system.layers.length - 1 ? (
                  <div className="relative z-10 flex h-12 items-center pl-6 sm:pl-10">
                    <ArrowDown className="size-4 text-[#3978f6]" />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
