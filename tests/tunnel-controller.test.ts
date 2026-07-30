import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import {
  TunnelController,
  type RuntimeProcess,
} from "../src/main/tunnel-controller";

class FakeRuntime extends EventEmitter implements RuntimeProcess {
  public readonly stdout = new EventEmitter();
  public readonly stderr = new EventEmitter();
  public kill = vi.fn(() => true);
}

describe("TunnelController", () => {
  it("reports connected only after the runtime readiness marker", async () => {
    const runtime = new FakeRuntime();
    const controller = new TunnelController(() => runtime, 1_000);
    const started = controller.start("fake-runtime", ["run"]);

    expect(controller.status).toBe("connecting");
    runtime.stdout.emit("data", Buffer.from("READY 127.0.0.1:10808\n"));

    await expect(started).resolves.toBeUndefined();
    expect(controller.status).toBe("connected");
  });

  it("stops the child process and reaches disconnected", async () => {
    const runtime = new FakeRuntime();
    const controller = new TunnelController(() => runtime, 1_000);
    const started = controller.start("fake-runtime", []);
    runtime.stdout.emit("data", Buffer.from("READY\n"));
    await started;

    const stopped = controller.stop();
    expect(runtime.kill).toHaveBeenCalledWith("SIGTERM");
    runtime.emit("exit", 0, null);

    await expect(stopped).resolves.toBeUndefined();
    expect(controller.status).toBe("disconnected");
  });

  it("reports an unexpected runtime exit as an error", async () => {
    const runtime = new FakeRuntime();
    const controller = new TunnelController(() => runtime, 1_000);
    const started = controller.start("fake-runtime", []);
    runtime.stdout.emit("data", Buffer.from("READY\n"));
    await started;

    runtime.emit("exit", 12, null);

    expect(controller.status).toBe("error");
    expect(controller.lastError).toContain("12");
  });

  it("times out and terminates a runtime that never becomes ready", async () => {
    vi.useFakeTimers();
    const runtime = new FakeRuntime();
    const controller = new TunnelController(() => runtime, 20);
    const started = expect(
      controller.start("fake-runtime", []),
    ).rejects.toThrow("не подтвердило готовность");
    await vi.advanceTimersByTimeAsync(25);

    await started;
    expect(runtime.kill).toHaveBeenCalledWith("SIGTERM");
    expect(controller.status).toBe("error");
    vi.useRealTimers();
  });
});
