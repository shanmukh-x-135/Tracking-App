export class ProviderUnavailableError extends Error {
  constructor(readonly provider: string, message = `${provider} is not configured.`) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

export async function providerJson<T>(provider: string, response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${provider} request failed with status ${response.status}.`);
  return response.json() as Promise<T>;
}
