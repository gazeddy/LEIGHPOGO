import Link from "next/link";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import { useMemo, useState, type FormEvent } from "react";
import { getAllGuides, type GuideSummary } from "../../lib/guides";
import { authOptions } from "../api/auth/[...nextauth]";

interface GuideLinksPageProps {
  initialGuides: GuideSummary[];
}

interface RelationshipForm {
  series: string;
  seriesOrder: string;
  relatedGuides: string[];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const getServerSideProps: GetServerSideProps<GuideLinksPageProps> = async (
  context,
) => {
  const session = await getServerSession(
    context.req,
    context.res,
    authOptions as NextAuthOptions,
  );

  if ((session?.user as { role?: string } | undefined)?.role !== "admin") {
    return {
      redirect: { destination: "/login", permanent: false },
    };
  }

  return {
    props: {
      initialGuides: getAllGuides(),
    },
  };
};

export default function GuideLinksPage({
  initialGuides,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [guides, setGuides] = useState(initialGuides);
  const [selectedSlug, setSelectedSlug] = useState(initialGuides[0]?.slug ?? "");
  const [form, setForm] = useState<RelationshipForm>(() => {
    const guide = initialGuides[0];

    return {
      series: guide?.series ?? "",
      seriesOrder: guide?.seriesOrder ? String(guide.seriesOrder) : "",
      relatedGuides: guide?.relatedGuides ?? [],
    };
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedGuide = useMemo(
    () => guides.find((guide) => guide.slug === selectedSlug) ?? null,
    [guides, selectedSlug],
  );

  const existingSeries = useMemo(
    () =>
      Array.from(
        new Set(
          guides
            .map((guide) => guide.series)
            .filter((series): series is string => Boolean(series)),
        ),
      ).sort(),
    [guides],
  );

  const seriesGroups = useMemo(() => {
    const groups = new Map<string, GuideSummary[]>();

    guides.forEach((guide) => {
      if (!guide.series) {
        return;
      }

      const current = groups.get(guide.series) ?? [];
      current.push(guide);
      groups.set(guide.series, current);
    });

    return Array.from(groups.entries())
      .map(([series, seriesGuides]) => ({
        series,
        guides: seriesGuides.sort((left, right) => {
          const difference =
            (left.seriesOrder ?? Number.MAX_SAFE_INTEGER) -
            (right.seriesOrder ?? Number.MAX_SAFE_INTEGER);

          return difference !== 0
            ? difference
            : left.title.localeCompare(right.title);
        }),
      }))
      .sort((left, right) => left.series.localeCompare(right.series));
  }, [guides]);

  function selectGuide(slug: string) {
    const guide = guides.find((item) => item.slug === slug);

    setSelectedSlug(slug);
    setForm({
      series: guide?.series ?? "",
      seriesOrder: guide?.seriesOrder ? String(guide.seriesOrder) : "",
      relatedGuides: guide?.relatedGuides ?? [],
    });
    setMessage(null);
    setError(null);
  }

  function toggleRelatedGuide(slug: string) {
    setForm((current) => ({
      ...current,
      relatedGuides: current.relatedGuides.includes(slug)
        ? current.relatedGuides.filter((item) => item !== slug)
        : [...current.relatedGuides, slug],
    }));
  }

  async function saveRelationships(event: FormEvent) {
    event.preventDefault();

    if (!selectedGuide) {
      return;
    }

    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/content/guides", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: selectedGuide.slug,
          series: form.series,
          seriesOrder: form.seriesOrder,
          relatedGuides: form.relatedGuides,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "The guide relationships could not be saved.");
      }

      setGuides((current) =>
        current.map((guide) =>
          guide.slug === selectedGuide.slug
            ? {
                ...guide,
                series: form.series || undefined,
                seriesOrder: form.seriesOrder
                  ? Number(form.seriesOrder)
                  : undefined,
                relatedGuides: form.relatedGuides.length
                  ? form.relatedGuides
                  : undefined,
              }
            : guide,
        ),
      );
      setMessage(payload.message);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The guide relationships could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="container guide-links-admin">
      <header className="page-header">
        <div>
          <p className="eyebrow">Admin tools</p>
          <h1>Guide relationships</h1>
          <p>
            Put existing guides into ordered series and add useful cross-links without
            editing Markdown files by hand.
          </p>
        </div>
        <div className="header-links">
          <Link href="/admin/content">Content creator</Link>
          <Link href="/admin">Admin panel</Link>
        </div>
      </header>

      {guides.length === 0 ? (
        <section className="panel">
          <p>No guides have been created yet.</p>
          <Link href="/admin/content">Create the first guide</Link>
        </section>
      ) : (
        <div className="editor-layout">
          <form className="panel editor" onSubmit={saveRelationships}>
            <h2>Edit a guide</h2>

            <label>
              Guide
              <select value={selectedSlug} onChange={(event) => selectGuide(event.target.value)}>
                {guides.map((guide) => (
                  <option key={guide.slug} value={guide.slug}>
                    {guide.title}
                  </option>
                ))}
              </select>
            </label>

            {selectedGuide && (
              <p className="selected-description">
                <strong>{selectedGuide.title}</strong>
                <span>{selectedGuide.description}</span>
                <Link href={`/guides/${selectedGuide.slug}`}>Open guide ↗</Link>
              </p>
            )}

            <fieldset>
              <legend>Series navigation</legend>
              <p className="help">
                Give connected guides the same series ID. Their positions determine the
                automatic Previous and Next links.
              </p>

              <div className="two-column">
                <label>
                  Series ID
                  <input
                    list="existing-guide-series"
                    pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                    placeholder="for example: raid-basics"
                    value={form.series}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        series: slugify(event.target.value),
                        seriesOrder: event.target.value ? current.seriesOrder : "",
                      }))
                    }
                  />
                  <datalist id="existing-guide-series">
                    {existingSeries.map((series) => (
                      <option key={series} value={series} />
                    ))}
                  </datalist>
                </label>

                <label>
                  Position in series
                  <input
                    type="number"
                    min="1"
                    step="1"
                    disabled={!form.series}
                    value={form.seriesOrder}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        seriesOrder: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend>Related guides</legend>
              <p className="help">
                These appear as separate recommendation cards below the guide.
              </p>
              <div className="related-grid">
                {guides
                  .filter((guide) => guide.slug !== selectedSlug)
                  .map((guide) => (
                    <label key={guide.slug} className="related-option">
                      <input
                        type="checkbox"
                        checked={form.relatedGuides.includes(guide.slug)}
                        onChange={() => toggleRelatedGuide(guide.slug)}
                      />
                      <span>
                        <strong>{guide.title}</strong>
                        <small>{guide.slug}</small>
                      </span>
                    </label>
                  ))}
              </div>
            </fieldset>

            {message && <p className="notice success">{message}</p>}
            {error && <p className="notice error" role="alert">{error}</p>}

            <button className="primary" disabled={saving}>
              {saving ? "Saving…" : "Save relationships"}
            </button>
          </form>

          <aside className="panel overview">
            <h2>Current series</h2>
            {seriesGroups.length === 0 ? (
              <p className="muted">No guide series have been defined yet.</p>
            ) : (
              <div className="series-list">
                {seriesGroups.map((group) => (
                  <section key={group.series}>
                    <h3>{group.series.replace(/-/g, " ")}</h3>
                    <ol>
                      {group.guides.map((guide) => (
                        <li key={guide.slug}>
                          <button type="button" onClick={() => selectGuide(guide.slug)}>
                            <span>{guide.title}</span>
                            <small>
                              {guide.seriesOrder
                                ? `Position ${guide.seriesOrder}`
                                : "No position"}
                            </small>
                          </button>
                        </li>
                      ))}
                    </ol>
                  </section>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}

      <style jsx>{`
        .guide-links-admin { padding-top: 28px; padding-bottom: 60px; }
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 22px; margin-bottom: 22px; }
        .page-header h1 { margin: 0; font-size: clamp(2rem, 5vw, 3rem); }
        .page-header p:last-child { max-width: 720px; color: #8b949e; line-height: 1.55; }
        .eyebrow { margin: 0 0 6px; color: #3fb950; font-size: .75rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
        .header-links { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 12px; }
        .header-links a, .panel a { color: #58a6ff; }
        .editor-layout { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(280px, .75fr); gap: 18px; align-items: start; }
        .panel { padding: 22px; border: 1px solid #30363d; border-radius: 12px; background: #161b22; }
        .panel h2 { margin-top: 0; }
        .editor { display: grid; gap: 17px; }
        label, fieldset { display: grid; gap: 7px; color: #f0f6fc; font-weight: 700; }
        input, select { width: 100%; box-sizing: border-box; border: 1px solid #30363d; border-radius: 7px; padding: 10px; background: #0d1117; color: #f0f6fc; font: inherit; }
        input:disabled { opacity: .55; cursor: not-allowed; }
        fieldset { border: 1px solid #30363d; border-radius: 9px; padding: 14px; }
        .help { margin: 0 0 7px; color: #8b949e; font-size: .87rem; font-weight: 400; line-height: 1.5; }
        .two-column { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .selected-description { display: grid; gap: 5px; margin: 0; padding: 12px; border: 1px solid #30363d; border-radius: 8px; background: #0d1117; }
        .selected-description span { color: #8b949e; line-height: 1.45; }
        .selected-description a { justify-self: start; }
        .related-grid { display: grid; max-height: 360px; overflow-y: auto; gap: 7px; }
        .related-option { display: flex; align-items: flex-start; gap: 9px; padding: 9px; border: 1px solid #30363d; border-radius: 7px; background: #0d1117; font-weight: 500; }
        .related-option input { width: auto; margin-top: 3px; }
        .related-option span { display: grid; gap: 2px; }
        .related-option small { color: #8b949e; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
        .primary { justify-self: start; border: 0; border-radius: 8px; padding: 11px 17px; background: #238636; color: #fff; font-weight: 800; cursor: pointer; }
        .primary:disabled { opacity: .6; cursor: wait; }
        .notice { margin: 0; padding: 11px 14px; border-radius: 8px; }
        .notice.success { border: 1px solid #238636; background: rgba(35,134,54,.15); }
        .notice.error { border: 1px solid #f85149; background: rgba(248,81,73,.12); }
        .muted { color: #8b949e; }
        .series-list { display: grid; gap: 16px; }
        .series-list section { padding-bottom: 14px; border-bottom: 1px solid #30363d; }
        .series-list section:last-child { padding-bottom: 0; border-bottom: 0; }
        .series-list h3 { margin: 0 0 9px; text-transform: capitalize; }
        .series-list ol { display: grid; gap: 6px; margin: 0; padding-left: 24px; }
        .series-list button { display: grid; width: 100%; gap: 2px; border: 0; padding: 7px 9px; border-radius: 6px; background: transparent; color: #f0f6fc; text-align: left; cursor: pointer; }
        .series-list button:hover { background: #21262d; }
        .series-list small { color: #8b949e; }
        @media (max-width: 900px) { .editor-layout { grid-template-columns: 1fr; } }
        @media (max-width: 620px) { .page-header { flex-direction: column; } .header-links { justify-content: flex-start; } .two-column { grid-template-columns: 1fr; } }
      `}</style>
    </main>
  );
}
