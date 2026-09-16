// FAST TRACK CI/CD + Observabilidade (ADR-0027 secao 19, "Graceful shutdown"). `process.emit`
// dispara os listeners de sinal como um EventEmitter comum -- nunca envia um sinal real de SO,
// entao e seguro dentro do worker de testes. `process.exit` e mockado explicitamente para nunca
// encerrar o worker do Vitest.
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerGracefulShutdown } from "../../src/server/observability/graceful-shutdown";

afterEach(() => {
  process.removeAllListeners("SIGTERM");
  process.removeAllListeners("SIGINT");
  vi.restoreAllMocks();
});

describe("Observabilidade - graceful shutdown (ADR-0027 s19)", () => {
  it("SIGTERM: para de aceitar novas conexoes, fecha o pool do Postgres e encerra com exit code 0", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    let capturedCloseCallback: ((error?: Error) => void) | undefined;
    const fakeServer = {
      close: vi.fn((callback: (error?: Error) => void) => {
        capturedCloseCallback = callback;
      })
    };
    const fakePool = { end: vi.fn().mockResolvedValue(undefined) };

    registerGracefulShutdown(fakeServer as never, fakePool as never, 5_000);

    process.emit("SIGTERM");

    expect(fakeServer.close).toHaveBeenCalledTimes(1);

    capturedCloseCallback?.();
    // Drena a cadeia de promises (pool.end().catch().finally()) antes de checar o exit.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(fakePool.end).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("um segundo sinal durante o shutdown em andamento e ignorado (nunca fecha o servidor duas vezes)", () => {
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const fakeServer = { close: vi.fn() };
    const fakePool = { end: vi.fn().mockResolvedValue(undefined) };

    registerGracefulShutdown(fakeServer as never, fakePool as never, 5_000);

    process.emit("SIGTERM");
    process.emit("SIGINT");

    expect(fakeServer.close).toHaveBeenCalledTimes(1);
  });
});
