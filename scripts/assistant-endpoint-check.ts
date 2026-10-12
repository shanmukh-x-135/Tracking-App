/**
 * No-cost, unauthenticated pre-launch check (privacy checklist items 2–3): the configured model's
 * Novita endpoint is still on OpenRouter's zero-data-retention list, is up, is free, and supports
 * tools. Sends no prompts and no user data.
 *
 *   MOSAIC_AI_MODEL=apodex/apodex-1.1-mini:free npm run assistant:endpoint-check
 */
import { reviewedModels } from "../src/lib/assistant/openrouter-model";

interface Endpoint { provider_name?: string; status?: number; pricing?: { prompt?: string; completion?: string }; supported_parameters?: string[]; model_id?: string; name?: string }

async function main() {
  const model = process.env.MOSAIC_AI_MODEL ?? reviewedModels[0].model;
  const reviewed = reviewedModels.find((item) => item.model === model);
  if (!reviewed) throw new Error(`${model} is not a reviewed model.`);
  const [zdr, details] = await Promise.all([
    fetch("https://openrouter.ai/api/v1/endpoints/zdr").then((response) => response.json()) as Promise<{ data: Endpoint[] }>,
    fetch(`https://openrouter.ai/api/v1/models/${model}/endpoints`).then((response) => response.json()) as Promise<{ data?: { endpoints?: Endpoint[] } }>,
  ]);
  const isNovita = (endpoint: Endpoint) => /novita/i.test(endpoint.provider_name ?? "");
  const zdrListed = zdr.data.some((endpoint) => endpoint.model_id === model && isNovita(endpoint));
  const endpoint = details.data?.endpoints?.find(isNovita);
  const checks = {
    "listed as ZDR on Novita": zdrListed,
    "Novita endpoint present": Boolean(endpoint),
    "endpoint status is up (0)": endpoint?.status === 0,
    "price is 0 / 0": endpoint?.pricing?.prompt === "0" && endpoint?.pricing?.completion === "0",
    "supports tools and tool_choice": Boolean(endpoint?.supported_parameters?.includes("tools") && endpoint.supported_parameters.includes("tool_choice")),
  };
  for (const [label, ok] of Object.entries(checks)) console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (Object.values(checks).some((ok) => !ok)) process.exitCode = 1;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
