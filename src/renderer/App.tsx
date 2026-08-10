import { useEffect, useMemo, useState } from "react";

import type {
  AppSnapshot,
  CommandResult,
} from "../shared/ipc-contracts";
import brandHero from "./assets/brand-hero.png";
import brandSplash from "./assets/brand-splash.png";

const browserPreview: AppSnapshot = {
  version: "preview",
  platform: "win32",
  paired: false,
  account: null,
  connectionStatus: "unpaired",
};

const browserPairedPreview: AppSnapshot = {
  version: "preview",
  platform: "win32",
  paired: true,
  account: {
    accountLabel: "@user134",
    expiresAt: "2027-07-30T00:00:00.000Z",
  },
  connectionStatus: "disconnected",
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
      setSnapshot(
        new URLSearchParams(window.location.search).get("preview") === "paired"
          ? browserPairedPreview
          : browserPreview,
      );
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
      if (!window.connect134 && import.meta.env.DEV) {
        setLoginCode("134-482");
        return;
      }
      const result = await window.connect134.startPairing();
      if (result.ok) setLoginCode(result.loginCode);
      else setMessage(result.message);
    } finally {
      setBusy(false);
    }
  }

  if (!snapshot) {
    return (
      <main className="loading-scene">
        <img src={brandSplash} alt="" />
        <div className="loading-content">
          <div className="loading-wordmark">134</div>
          <p>PRIVATE NETWORK · WINDOWS</p>
          <strong>{message ?? "Запускаем защищённую сеть"}</strong>
        </div>
      </main>
    );
  }

  const isConnected = snapshot.connectionStatus === "connected";
  const connectionIsChanging =
    snapshot.connectionStatus === "connecting" ||
    snapshot.connectionStatus === "disconnecting";

  return (
    <main className={`shell state--${snapshot.connectionStatus}`}>
      <header className="topbar">
        <div className="wordmark" aria-label="134 Connect">
          <span>134</span>
          <small>CONNECT</small>
        </div>
        <div className="topbar-meta">
          <span>WINDOWS</span>
          <span className="topbar-divider" aria-hidden="true" />
          <span>{snapshot.paired ? statusLabel : "АКТИВАЦИЯ"}</span>
        </div>
        <button
          className="text-button"
          type="button"
          onClick={() => {
            if (window.connect134) void window.connect134.openHelp();
          }}
        >
          Помощь
        </button>
      </header>

      <section className="workspace">
        <aside className="brand-stage">
          <img
            className="brand-image"
            src={brandHero}
            alt="134 — защищённый интернет в городе и в поездках"
          />
          <div className="brand-shade" aria-hidden="true" />
          <div className="brand-caption">
            <span>134</span>
            <p>Интернет<br />на твоих условиях</p>
          </div>
        </aside>

        <div className="control-panel">
          <div className="status-line" aria-live="polite">
            <span className="status-dot" aria-hidden="true" />
            <strong>{statusLabel}</strong>
          </div>
          <p className="eyebrow">134 PRIVATE NETWORK</p>
          <h1>
            {snapshot.paired
              ? isConnected
                ? "Свободно. Защищено."
                : "Открой свой интернет."
              : "Один код. И вы в сети."}
          </h1>
          <p className="lead">
            {snapshot.paired
              ? isConnected
                ? "Ваш трафик проходит через защищённую сеть 134. Можно работать, смотреть и общаться."
                : "Подключите защищённую сеть 134 одним нажатием. Никаких ключей, сложных настроек и лишних окон."
              : "Свяжите приложение с Telegram — подписка и ваши устройства появятся здесь автоматически."}
          </p>

          {snapshot.paired && snapshot.account ? (
            <>
              <button
                className={`connect-button ${isConnected ? "connect-button--active" : ""}`}
                disabled={busy || connectionIsChanging}
                type="button"
                onClick={() =>
                  void apply(
                    isConnected
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
                <span>{isConnected ? "Отключить VPN" : "Подключить VPN"}</span>
                <strong aria-hidden="true">{isConnected ? "OFF" : "ON"}</strong>
              </button>
              <p className="connection-note">
                {connectionIsChanging
                  ? statusLabel
                  : isConnected
                    ? "Защищённое соединение активно"
                    : "Готово к подключению"}
              </p>
              <div className="account-card">
                <div>
                  <span>ПРОФИЛЬ</span>
                  <strong>{snapshot.account.accountLabel}</strong>
                </div>
                <div>
                  <span>ПОДПИСКА ДО</span>
                  <strong>{formatExpiry(snapshot.account.expiresAt)}</strong>
                </div>
              </div>
            </>
          ) : (
            <div className="pairing-form">
              {loginCode ? (
                <div className="login-code" aria-live="polite">
                  <span>КОМАНДА ДЛЯ TELEGRAM</span>
                  <strong>
                    /login <b>{loginCode}</b>
                  </strong>
                  <p>Скопируйте команду и отправьте её боту 134.</p>
                </div>
              ) : (
                <div className="pairing-steps">
                  <div>
                    <span>01</span>
                    <p>
                      <strong>Получите код</strong>
                      <small>Он действует 10 минут</small>
                    </p>
                  </div>
                  <div>
                    <span>02</span>
                    <p>
                      <strong>Подтвердите в Telegram</strong>
                      <small>Без логина и пароля</small>
                    </p>
                  </div>
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
                    ? "Проверить подключение"
                    : "Получить код"}
              </button>
              <p className="form-hint">
                134 не показывает и не хранит ваш пароль Telegram.
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
        <span>134134.RU</span>
        <span>Версия {snapshot.version}</span>
        <span>ДО 5 УСТРОЙСТВ</span>
      </footer>
    </main>
  );
}
