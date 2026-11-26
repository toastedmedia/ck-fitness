"use client";
import { useEffect, useState } from "react";
import { CAMPAIGN_PRESETS, renderCampaign } from "@ck/core";
import { ABtn, aInput } from "@/components/admin/ui";
import { previewCampaignAudience } from "@/app/admin/actions";

export interface CampaignValues {
  name: string;
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  cta_label: string;
  cta_url: string;
  plan: string;
  tag: string;
  /** "news" = members with "New trainings and content" on; "offers" = Offers and news opt-ins. */
  consent: string;
  /** "any" | "has" | "lacks" */
  trainingMode: string;
  training: string;
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block text-xs font-bold text-brand">
    {label}
    <div className="mt-1 font-normal">{children}</div>
  </label>
);

/** Write a marketing email with a live preview. Presets fill in the boxes; every word stays editable. */
export function CampaignForm({
  action,
  initial,
  tags,
  trainings = [],
  imageUrl,
  siteUrl,
}: {
  action: (formData: FormData) => void | Promise<void>;
  initial: CampaignValues;
  tags: { id: string; name: string }[];
  trainings?: { id: string; title: string }[];
  imageUrl: string | null;
  siteUrl: string;
}) {
  const [v, setV] = useState<CampaignValues>(initial);
  const [pic, setPic] = useState<string | null>(null);
  const set = (k: keyof CampaignValues) => (e: { target: { value: string } }) =>
    setV((p) => ({ ...p, [k]: e.target.value }));
  // Live "This goes to N people" whenever the audience changes.
  const [reach, setReach] = useState<{
    total: number;
    people: { name: string; email: string }[];
  } | null>(null);
  const [counting, setCounting] = useState(false);
  useEffect(() => {
    const fd = new FormData();
    fd.set("audience_plan", v.plan);
    fd.set("audience_tag", v.tag);
    fd.set("audience_consent", v.consent);
    fd.set("audience_training_mode", v.trainingMode);
    fd.set("audience_training", v.training);
    let live = true;
    setCounting(true);
    const t = setTimeout(() => {
      previewCampaignAudience(fd)
        .then((r) => live && setReach(r))
        .catch(() => live && setReach(null))
        .finally(() => live && setCounting(false));
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [v.plan, v.tag, v.consent, v.trainingMode, v.training]);
  const preview = renderCampaign(
    {
      subject: v.subject,
      preheader: v.preheader,
      heading: v.heading,
      body: v.body,
      imageUrl: pic ?? imageUrl,
      ctaLabel: v.cta_label,
      ctaUrl: v.cta_url,
    },
    { name: "Priya" },
    {
      siteUrl,
      unsubscribeUrl: `${siteUrl}/unsubscribe-sample`,
      reason:
        v.consent !== "offers"
          ? "You are getting this because you get news about trainings and the app."
          : undefined,
    },
  );
  return (
    <form action={action} className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <div>
          <p className="mb-1 text-xs font-bold text-brand">Start from an idea</p>
          <div className="flex flex-wrap gap-2">
            {CAMPAIGN_PRESETS.map((p) => (
              <button
                type="button"
                key={p.key}
                onClick={() =>
                  setV((o) => ({
                    ...o,
                    name: o.name || p.label,
                    subject: p.subject,
                    preheader: p.preheader,
                    heading: p.heading,
                    body: p.body,
                    cta_label: p.ctaLabel,
                    cta_url: p.ctaUrl,
                  }))
                }
                className="min-h-10 rounded-full border-2 border-line px-3 text-xs font-bold text-brand"
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">
            Replace everything in [square brackets] before you send.
          </p>
        </div>
        <Field label="Name (only you see this)">
          <input name="name" value={v.name} onChange={set("name")} className={aInput} />
        </Field>
        <Field label="Subject line">
          <input
            name="subject"
            required
            maxLength={150}
            value={v.subject}
            onChange={set("subject")}
            className={aInput}
          />
        </Field>
        <Field label="Preview text (shown after the subject in the inbox)">
          <input
            name="preheader"
            maxLength={150}
            value={v.preheader}
            onChange={set("preheader")}
            className={aInput}
          />
        </Field>
        <Field label="Big heading">
          <input
            name="heading"
            maxLength={150}
            value={v.heading}
            onChange={set("heading")}
            className={aInput}
          />
        </Field>
        <Field label="Message (blank line = new paragraph, start a line with - for bullets, {{name}} = first name)">
          <textarea
            name="body"
            required
            rows={10}
            maxLength={6000}
            value={v.body}
            onChange={set("body")}
            className={`${aInput} py-2`}
          />
        </Field>
        <Field label="Picture (optional, JPG/PNG/WebP up to 2 MB)">
          <input
            type="file"
            name="image"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setPic(f ? URL.createObjectURL(f) : null);
            }}
            className="text-sm"
          />
          {imageUrl ? (
            <label className="mt-1 flex items-center gap-2 text-xs">
              <input type="checkbox" name="remove_image" /> Remove the saved picture
            </label>
          ) : null}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Button text">
            <input
              name="cta_label"
              maxLength={40}
              value={v.cta_label}
              onChange={set("cta_label")}
              className={aInput}
            />
          </Field>
          <Field label="Button goes to">
            <input
              name="cta_url"
              maxLength={500}
              value={v.cta_url}
              onChange={set("cta_url")}
              placeholder="/programs or https://…"
              className={aInput}
            />
          </Field>
        </div>
        <fieldset className="grid gap-3 rounded-xl border-2 border-line p-3">
          <legend className="px-1 text-sm font-bold text-brand">Who gets it</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Plan">
              <select
                name="audience_plan"
                value={v.plan}
                onChange={set("plan")}
                className={aInput}
              >
                <option value="all">Everyone</option>
                <option value="free">Free members only</option>
                <option value="member">CK Members only</option>
              </select>
            </Field>
            <Field label="Tag">
              <select
                name="audience_tag"
                value={v.tag}
                onChange={set("tag")}
                className={aInput}
              >
                <option value="">Any tag</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Training">
              <select
                name="audience_training_mode"
                value={v.trainingMode}
                onChange={set("trainingMode")}
                className={aInput}
              >
                <option value="any">Any (no training filter)</option>
                <option value="has">Has access to…</option>
                <option value="lacks">Does NOT have access to…</option>
              </select>
            </Field>
            <Field label="Which training">
              <select
                name="audience_training"
                value={v.training}
                onChange={set("training")}
                disabled={v.trainingMode === "any"}
                className={aInput}
              >
                <option value="">Choose a training</option>
                {trainings.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-1 text-sm">
            <span className="text-xs font-bold text-brand">Send it as</span>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="audience_consent"
                value="news"
                checked={v.consent !== "offers"}
                onChange={set("consent")}
                className="mt-1 size-4 accent-brand"
              />
              <span>
                <b>Training and app news</b>{" "}
                <span className="text-xs text-muted">
                  members who keep &quot;New trainings and content&quot; on in Profile
                  (most members)
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="audience_consent"
                value="offers"
                checked={v.consent === "offers"}
                onChange={set("consent")}
                className="mt-1 size-4 accent-brand"
              />
              <span>
                <b>Offers and promotions</b>{" "}
                <span className="text-xs text-muted">
                  only members who turned on &quot;Offers and news&quot;
                </span>
              </span>
            </label>
          </div>
          <div className="rounded-xl bg-bg p-3 text-sm">
            {v.trainingMode !== "any" && !v.training ? (
              <span className="text-muted">Choose a training to see who it goes to.</span>
            ) : counting && !reach ? (
              <span className="text-muted">Counting…</span>
            ) : reach ? (
              <>
                This goes to <b>{reach.total}</b>{" "}
                {reach.total === 1 ? "person" : "people"}
                {counting ? " (updating…)" : ""}.
                {reach.people.length ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-bold text-brand underline">
                      See who
                    </summary>
                    <ul className="mt-2 max-h-56 overflow-y-auto text-xs">
                      {reach.people.map((p) => (
                        <li key={p.email + p.name} className="py-0.5">
                          {p.name} <span className="text-muted">{p.email}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </>
            ) : (
              <span className="text-muted">Could not count right now.</span>
            )}
            <p className="mt-2 text-xs text-muted">
              Only people who signed up themselves and kept Email on. Every email has an
              unsubscribe link. Imported members are never emailed.
            </p>
          </div>
        </fieldset>
        <ABtn variant="primary">Save draft</ABtn>
      </div>
      <div className="lg:sticky lg:top-4 lg:self-start">
        <p className="mb-1 text-xs font-bold text-brand">Live preview</p>
        <p className="mb-1 text-xs text-muted">
          Subject: <b>{preview.subject}</b>
        </p>
        <iframe
          title="Email preview"
          srcDoc={preview.html}
          sandbox=""
          className="h-[640px] w-full rounded-xl border border-line bg-white"
        />
      </div>
    </form>
  );
}
