import {
  createPairingSessionResponseSchema,
  pairingPollResponseSchema,
  type PairingPollResponse,
} from "../shared/client-contracts";

const SESSION_ENDPOINT = "/api/device-auth/sessions";
const POLL_ENDPOINT = "/api/device-auth/sessions/poll";

export class PairingClient {
  readonly #baseUrl: URL;

  public constructor(baseUrl: string) {
    this.#baseUrl = new URL(baseUrl);
  }

  public async create(
    deviceName: string,
    platform: "windows" | "macos",
    devicePublicKey: string,
  ) {
    const response = await fetch(new URL(SESSION_ENDPOINT, this.#baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceName, platform, devicePublicKey }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      throw new Error("Не удалось создать код входа");
    }

    return createPairingSessionResponseSchema.parse(await response.json());
  }

  public async poll(pollSecret: string): Promise<PairingPollResponse> {
    const response = await fetch(new URL(POLL_ENDPOINT, this.#baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pollSecret }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      throw new Error("Не удалось проверить подтверждение");
    }

    return pairingPollResponseSchema.parse(await response.json());
  }
}
