import "server-only";
import { extractJson, parseAiMeal, type AiMeal } from "@ck/core";

/** The model is a setting, not a constant: change OPENAI_NUTRITION_MODEL in Vercel without a code change. */
export const aiModel = () => process.env.OPENAI_NUTRITION_MODEL || "gpt-4o-mini";
export const aiConfigured = () => Boolean(process.env.OPENAI_API_KEY);

const SYSTEM = `You are the meal estimator inside a fitness coaching app. You estimate the nutrition of a meal from a photo and/or a short text description.

Rules:
1. These are ESTIMATES only. Never claim exact calories or exact portions.
2. List each visible food as its own item. Combine tiny garnishes into the dish they belong to.
3. Estimate realistic serving sizes for the amount actually shown, and describe the serving in plain words (for example "2 medium rotis", "1 small bowl").
4. Be honest about uncertainty. Set confidence to "low", "medium" or "high" for every item.
5. Mention hidden oil, ghee, butter, cream, sugar or sauces in "notes" when relevant, and include a sensible amount in your estimate.
6. If the member gave a description or corrections, trust them over what you think you see.
7. No medical claims. Do not diagnose, do not mention eating disorders or medical conditions, do not prescribe or recommend extreme diets or calorie levels.
8. If you are unsure, pick a reasonable midpoint estimate for tracking and say why in "notes".
9. You know home-cooked and restaurant foods from around the world, including South Asian meals (roti, chapati, paratha, dal, rajma, chole, paneer dishes, sabji, biryani, pulao, poha, idli, dosa, kadhi, dahi, lassi, chai, butter chicken, chicken curry, mixed homemade thali meals). Estimate from what is actually in the meal; do not use a fixed number per dish name.
10. If the image does not contain food and there is no description, return an empty "items" array and explain in "notes".

Return ONLY a JSON object, no prose, in exactly this shape:
{
  "items": [
    {
      "name": "Roti",
      "quantity": 2,
      "serving_description": "2 medium rotis",
      "estimated_calories": 190,
      "estimated_protein_g": 6,
      "estimated_carbs_g": 38,
      "estimated_fat_g": 2,
      "confidence": "medium"
    }
  ],
  "totals": { "estimated_calories": 0, "estimated_protein_g": 0, "estimated_carbs_g": 0, "estimated_fat_g": 0 },
  "notes": ["short plain-English notes about uncertainty"]
}
Numbers must be plain numbers (no units, no ranges).`;

export type AnalyzeResult =
  | { ok: true; value: AiMeal; model: string }
  | { ok: false; error: "unavailable" | "unreadable" | "failed" };

/** Server only. The API key never reaches the browser. Nothing is saved here: the member reviews first. */
export async function analyzeMeal(input: {
  imageBase64?: string;
  description?: string;
  mealType?: string;
}): Promise<AnalyzeResult> {
  if (!aiConfigured()) return { ok: false, error: "unavailable" };
  const model = aiModel();
  const context = [
    input.mealType ? `Meal type: ${input.mealType}.` : "",
    input.description ? `The member says: "${input.description.slice(0, 500)}"` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const content: unknown[] = [
    { type: "text", text: context || "Estimate the meal in this photo." },
  ];
  if (input.imageBase64)
    content.push({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${input.imageBase64}`, detail: "auto" },
    });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content },
        ],
      }),
    });
    if (!res.ok) {
      console.error("openai nutrition request failed", res.status);
      return { ok: false, error: "failed" };
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const parsed = parseAiMeal(extractJson(data.choices?.[0]?.message?.content ?? ""));
    if (!parsed.ok) return { ok: false, error: "unreadable" };
    return { ok: true, value: parsed.value, model };
  } catch (e) {
    console.error("openai nutrition error", (e as Error).name);
    return { ok: false, error: "failed" };
  } finally {
    clearTimeout(timer);
  }
}
