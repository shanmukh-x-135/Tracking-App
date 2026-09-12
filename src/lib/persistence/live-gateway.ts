import type { MosaicState, PersistenceGateway, PersistenceMutation } from "@/lib/persistence/types";

async function request(method: "GET" | "POST", mutation?: PersistenceMutation): Promise<MosaicState> {
  const response = await fetch("/api/me/state", {
    method,
    headers: mutation ? { "content-type": "application/json" } : undefined,
    body: mutation ? JSON.stringify(mutation) : undefined,
  });
  if (response.status === 401) throw new Error("Sign in to save this update.");
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? "Mosaic could not save your update.");
  }
  return response.json() as Promise<MosaicState>;
}

export const livePersistenceGateway: PersistenceGateway = {
  load() { return request("GET"); },
  mutate(_userId, mutation) { return request("POST", mutation); },
};
