import { z } from "zod";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const activeConfigurationSchema = z
  .object({
    status: z.literal("active"),
    subscriptionUrl: z
      .url()
      .refine((value) => new URL(value).protocol === "https:"),
    expiresAt: z.string().datetime({ offset: true }),
    requestId: z.string().min(1).max(128).optional(),
  })
  .strip();

const errorResponseSchema = z
  .object({
    status: z.enum([
      "unauthorized",
      "subscription_required",
      "configuration_unavailable",
    ]),
    requestId: z.string().min(1).max(128).optional(),
  })
  .passthrough();

export type ActiveDeviceConfiguration = {
  status: "active";
  subscriptionUrl: string;
  expiresAt: string;
};

export class DeviceConfigurationClient {
  readonly #baseUrl: URL;
  readonly #fetch: FetchLike;

  public constructor(baseUrl: string, fetchLike: FetchLike = fetch) {
    this.#baseUrl = new URL(baseUrl);
    this.#fetch = fetchLike;
  }

  public async get(
    sessionToken: string,
  ): Promise<ActiveDeviceConfiguration> {
    const response = await this.#fetch(
      new URL("/api/device-auth/configuration", this.#baseUrl),
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${sessionToken}`,
          accept: "application/json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(12_000),
      },
    );
    const payload: unknown = await response.json().catch(() => null);

    if (response.ok) {
      const parsed = activeConfigurationSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error("Некорректный ответ сервера конфигурации");
      }
      return {
        status: parsed.data.status,
        subscriptionUrl: parsed.data.subscriptionUrl,
        expiresAt: parsed.data.expiresAt,
      };
    }

    const error = errorResponseSchema.safeParse(payload);
    if (error.success) {
      if (error.data.status === "subscription_required") {
        throw new Error("Нужна активная подписка 134.");
      }
      if (error.data.status === "unauthorized") {
        throw new Error("Устройство отключено. Снова привяжите его в Telegram.");
      }
    }

    throw new Error("Не удалось получить защищённую конфигурацию.");
  }
}
