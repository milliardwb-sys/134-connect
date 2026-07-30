type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const MAX_SUBSCRIPTION_BYTES = 1_048_576;

export class SubscriptionClient {
  public constructor(private readonly fetchLike: FetchLike = fetch) {}

  public async get(subscriptionUrl: string): Promise<string> {
    const url = new URL(subscriptionUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash
    ) {
      throw new Error("Ссылка подписки должна использовать HTTPS");
    }

    const response = await this.fetchLike(url, {
      method: "GET",
      headers: {
        accept: "text/plain",
        "user-agent": "134-Connect/0.1",
      },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error("Сервер не выдал конфигурацию подключения");
    }

    const declaredLength = Number(
      response.headers.get("content-length") ?? "0",
    );
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_SUBSCRIPTION_BYTES
    ) {
      throw new Error("Ответ конфигурации слишком большой");
    }
    if (!response.body) {
      throw new Error("Сервер вернул пустую конфигурацию");
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const part = await reader.read();
      if (part.done) break;
      received += part.value.byteLength;
      if (received > MAX_SUBSCRIPTION_BYTES) {
        await reader.cancel();
        throw new Error("Ответ конфигурации слишком большой");
      }
      chunks.push(part.value);
    }

    const payload = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      payload.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return new TextDecoder("utf-8", { fatal: true }).decode(payload);
  }
}
