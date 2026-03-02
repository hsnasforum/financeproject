import { uiTextKo } from "@/lib/uiText.ko";

export default function HelpPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-semibold">{uiTextKo.help.title}</h1>
      <p className="mt-2 text-sm text-slate-600">{uiTextKo.help.subtitle}</p>

      <div className="mt-8 space-y-6">
        {uiTextKo.help.sections.map((section) => (
          <section key={section.title} className="rounded-lg border bg-white p-4">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {section.body.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
