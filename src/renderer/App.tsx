import { useEffect, useMemo, useState } from "react";

import type {
  AppSnapshot,
  CommandResult,
} from "../shared/ipc-contracts";

const browserPreview: AppSnapshot = {
  version: "preview",
  platform: "win32",
  paired: false,
  account: null,
  connectionStatus: "unpaired",
};

function formatExpiry(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [loginCode, setLoginCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!window.connect134 && import.meta.env.DEV) {
      setSnapshot(browserPreview);
      return;
    }

    let disposed = false;
    const refresh = () =>
      window.connect134
      .getSnapshot()
      .then((nextSnapshot) => {
        if (!disposed) setSnapshot(nextSnapshot);
      });
    void refresh().catch(() =>
      setMessage("Не удалось запустить защищённый модуль."),
    );
    const interval = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 2_000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, []);

  const statusLabel = useMemo(() => {
    if (!snapshot) return "Загрузка";
    const labels: Record<AppSnapshot["connectionStatus"], string> = {
      unpaired: "Нужна привязка",
      disconnected: "VPN выключен",
      connecting: "Подключаем",
      connected: "В сети",
      disconnecting: "Отключаем",
      error: "Нужна проверка",
    };
    return labels[snapshot.connectionStatus];
  }, [snapshot]);

  async function apply(result: Promise<CommandResult>): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await result;
      if (response.ok) setSnapshot(response.snapshot);
      else setMessage(response.message);
    } finally {
      setBusy(false);
    }
  }

  async function startPairing(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const result = await window.connect134.startPairing();
      if (result.ok) setLoginCode(result.loginCode);
      else setMessage(result.message);
    } finally {
      setBusy(false);
    }
  }

  if (!snapshot) {
    return (
      <main className="shell shell--loading">
        <div className="loading-mark">134</div>
        <p>{message ?? "Готовим защищённое подключение…"}</p>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="wordmark" aria-label="134 Connect">
          <span>134</span>
          <small>CONNECT</small>
        </div>
        <button
          className="text-button"
          type="button"
          onClick={() => void window.connect134.openHelp()}
        >
          Помощь
        </button>
      </header>

      <section className="workspace">
        <div className="signal-stage" aria-hidden="true">
          <div className="rays" />
          <div className="signal-number">134</div>
        </div>

        <div className="control-panel">
          <p className="eyebrow">PRIVATE NETWORK · WINDOWS</p>
          <h1>{snapshot.paired ? statusLabel : "Подключите аккаунт"}</h1>
          <p className="lead">
            {snapshot.paired
              ? "Один клик — и интернет работает через защищённую сеть 134."
              : "Получите одноразовый код в Telegram и введите его здесь. Ссылки и ключи останутся скрыты."}
          </p>

          {snapshot.paired && snapshot.account ? (
            <>
              <button
                className="power-button"
                disabled={busy}
                type="button"
                onClick={() =>
                  void apply(
                    snapshot.connectionStatus === "connected"
                      ? window.connect134.disconnect()
                      : window.connect134.connect(),
                  )
                }
                aria-label={
                  snapshot.connectionStatus === "connected"
                    ? "Отключить VPN"
                    : "Подключить VPN"
                }
              >
                <span className="power-icon" />
              </button>
              <div className="account-card">
                <div>
                  <span>Аккаунт</span>
                  <strong>{snapshot.account.accountLabel}</strong>
                </div>
                <div>
                  <span>Подписка до</span>
                  <strong>{formatExpiry(snapshot.account.expiresAt)}</strong>
                </div>
              </div>
            </>
          ) : (
            <div className="pairing-form">
              {loginCode ? (
                <div className="login-code" aria-live="polite">
                  <span>Отправьте боту команду</span>
                  <strong>/login {loginCode}</strong>
                </div>
              ) : (
                <div className="pairing-intro">
                  <span>Без пароля</span>
                  <strong>Подтверждение займёт меньше минуты</strong>
                </div>
              )}
              <button
                className="primary-button"
                disabled={busy}
                type="button"
                onClick={() =>
                  void (loginCode
                    ? apply(window.connect134.checkPairing())
                    : startPairing())
                }
              >
                {busy
                  ? "Проверяем…"
                  : loginCode
                    ? "Я подтвердил в Telegram"
                    : "Получить код входа"}
              </button>
              <p className="form-hint">
                Код действует 10 минут и используется только один раз.
              </p>
            </div>
          )}

          {message && (
            <div className="notice" role="status">
              <span>!</span>
              <p>{message}</p>
            </div>
          )}
        </div>
      </section>

      <footer>
        <span>134134.ru</span>
        <span>Версия {snapshot.version} · до 5 устройств</span>
      </footer>
    </main>
  );
}
