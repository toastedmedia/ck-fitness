"use client";
import { useState } from "react";
import { CAMPAIGN_PRESETS, renderCampaign } from "@ck/core";
import { ABtn, aInput } from "@/components/admin/ui";

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
  imageUrl,
  siteUrl,
}: {
  action: (formData: FormData) => void | Promise<void>;
  initial: CampaignValues;
  tags: { id: string; name: string }[];
  imageUrl: string | null;
  siteUrl: string;
}) {
  const [v, setV] = useState<CampaignValues>(initial);
  const [pic, setPic] = useState<string | null>(null);
  const set = (k: keyof CampaignValues) => (e: { target: { value: string } }) =>
    setV((p) => ({ ...p, [k]: e.target.value }));
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
    { siteUrl, unsubscribeUrl: `${siteUrl}/unsubscribe-sample` },
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
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Who gets it">
            <select
              name="audience_plan"
              value={v.plan}
              onChange={set("plan")}
              className={aInput}
            >
              <option value="all">Everyone who opted in</option>
              <option value="free">Free members only</option>
              <option value="member">Paid members only</option>
            </select>
          </Field>
          <Field label="Only members with this tag">
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
        </div>
        <p className="rounded-xl bg-bg p-3 text-xs text-muted">
          Only members who turned on both Email and Offers and news in their Profile
          receive this. Imported members are left out until they opt in.
        </p>
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
