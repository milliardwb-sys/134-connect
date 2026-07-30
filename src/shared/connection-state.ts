type AccountContext = {
  accountLabel: string;
  expiresAt: string;
};

export type ConnectionState =
  | { status: "unpaired" }
  | ({ status: "disconnected" } & AccountContext)
  | ({ status: "connecting" } & AccountContext)
  | ({
      status: "connected";
      location: string;
      connectedAt: string;
    } & AccountContext)
  | ({ status: "disconnecting" } & AccountContext)
  | ({
      status: "error";
      publicMessage: string;
      incidentId: string;
    } & AccountContext);

export type ConnectionEvent =
  | ({
      type: "pairingConfirmed";
    } & AccountContext)
  | { type: "connectRequested" }
  | {
      type: "runtimeConnected";
      location: string;
      connectedAt: string;
    }
  | {
      type: "runtimeFailed";
      publicMessage: string;
      incidentId: string;
    }
  | { type: "disconnectRequested" }
  | { type: "runtimeDisconnected" }
  | { type: "pairingExpired" };

export const initialConnectionState: ConnectionState = {
  status: "unpaired",
};

export function transitionConnection(
  current: ConnectionState,
  event: ConnectionEvent,
): ConnectionState {
  if (event.type === "pairingExpired" && current.status !== "unpaired") {
    return initialConnectionState;
  }

  if (current.status === "unpaired" && event.type === "pairingConfirmed") {
    return {
      status: "disconnected",
      accountLabel: event.accountLabel,
      expiresAt: event.expiresAt,
    };
  }

  if (
    (current.status === "disconnected" || current.status === "error") &&
    event.type === "connectRequested"
  ) {
    return {
      status: "connecting",
      ...accountContext(current),
    };
  }

  if (current.status === "connecting" && event.type === "runtimeConnected") {
    return {
      status: "connected",
      ...accountContext(current),
      location: event.location,
      connectedAt: event.connectedAt,
    };
  }

  if (
    (current.status === "connecting" ||
      current.status === "disconnecting") &&
    event.type === "runtimeFailed"
  ) {
    return {
      status: "error",
      ...accountContext(current),
      publicMessage: event.publicMessage,
      incidentId: event.incidentId,
    };
  }

  if (current.status === "connected" && event.type === "disconnectRequested") {
    return {
      status: "disconnecting",
      ...accountContext(current),
    };
  }

  if (
    current.status === "disconnecting" &&
    event.type === "runtimeDisconnected"
  ) {
    return {
      status: "disconnected",
      ...accountContext(current),
    };
  }

  throw new Error("Недопустимый переход состояния");
}

function accountContext(state: Exclude<ConnectionState, { status: "unpaired" }>) {
  return {
    accountLabel: state.accountLabel,
    expiresAt: state.expiresAt,
  };
}

