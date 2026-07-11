import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { resolveActivitySession } from "../services/discordActivity";
import type {
  ActivityAck,
  ActivityMediaItem,
  ActivityRepeatMode,
  ActivitySessionState,
  ConnectionStatus,
  ResolvedActivitySession
} from "../types/activity";

function ackPromise<T>(executor: (ack: (response: ActivityAck<T>) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    executor((response) => {
      if (response.ok) {
        resolve(response.data);
      } else {
        reject(new Error(response.error.message));
      }
    });
  });
}

export function useActivitySocket() {
  const socketRef = useRef<Socket | null>(null);
  const [session, setSession] = useState<ResolvedActivitySession | null>(null);
  const [state, setState] = useState<ActivitySessionState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let socket: Socket | null = null;
    let refreshingAuth = false;

    void resolveActivitySession()
      .then((resolved) => {
        if (disposed) return;
        setSession(resolved);
        socket = io(import.meta.env.VITE_ACTIVITY_API_BASE_URL || undefined, {
          path: "/socket.io",
          auth: { sessionToken: resolved.auth.sessionToken },
          transports: ["websocket", "polling"],
          reconnection: true
        });
        socketRef.current = socket;
        socket.on("connect", () => {
          setStatus("connected");
          socket?.emit("session:join", (response: ActivityAck<ActivitySessionState>) => {
            if (response.ok) setState(response.data);
            else setError(response.error.message);
          });
        });
        socket.io.on("reconnect_attempt", () => setStatus("reconnecting"));
        socket.on("disconnect", () => setStatus("offline"));
        socket.on("connect_error", (nextError) => {
          setStatus("offline");
          setError(nextError.message);
          if (/session token|expired|invalid/i.test(nextError.message) && !refreshingAuth) {
            refreshingAuth = true;
            void resolveActivitySession()
              .then((refreshed) => {
                if (disposed || !socket) return;
                setSession(refreshed);
                socket.auth = { sessionToken: refreshed.auth.sessionToken };
                setStatus("reconnecting");
                socket.connect();
              })
              .catch((authError) => setError(authError instanceof Error ? authError.message : "Activity reauthorization failed."))
              .finally(() => { refreshingAuth = false; });
          }
        });
        socket.on("session:state", (nextState: ActivitySessionState) => setState(nextState));
        socket.on("sync:state", (nextState: ActivitySessionState) => setState(nextState));
        socket.on("error", (nextError: { message?: string }) => setError(nextError.message ?? "Activity connection error."));
      })
      .catch((nextError) => {
        if (!disposed) {
          setStatus("offline");
          setError(nextError instanceof Error ? nextError.message : "Activity initialization failed.");
        }
      });

    return () => {
      disposed = true;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, []);

  const noPayload = useCallback(async (event: string) => {
    const socket = socketRef.current;
    if (!socket) throw new Error("Activity is offline.");
    try {
      const next = await ackPromise<ActivitySessionState>((ack) => socket.emit(event, ack));
      setState(next);
      return next;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Activity command failed.");
      throw nextError;
    }
  }, []);

  const withPayload = useCallback(async (event: string, payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (!socket) throw new Error("Activity is offline.");
    try {
      const next = await ackPromise<ActivitySessionState>((ack) => socket.emit(event, payload, ack));
      setState(next);
      return next;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Activity command failed.");
      throw nextError;
    }
  }, []);

  const actions = useMemo(() => ({
    add: (item: ActivityMediaItem) => withPayload("queue:add", { item }),
    remove: (queueItemId: string) => withPayload("queue:remove", { queueItemId }),
    reorder: (queueItemIds: string[]) => withPayload("queue:reorder", { queueItemIds }),
    clear: () => noPayload("queue:clear"),
    playNext: (queueItemId: string) => withPayload("queue:play-next", { queueItemId }),
    play: () => noPayload("player:play"),
    pause: (positionSeconds: number) => withPayload("player:pause", { positionSeconds }),
    seek: (positionSeconds: number) => withPayload("player:seek", { positionSeconds }),
    next: () => noPayload("player:next"),
    previous: () => noPayload("player:previous"),
    ended: (queueItemId: string) => withPayload("player:ended", { queueItemId }),
    shuffle: (enabled: boolean) => withPayload("settings:shuffle", { enabled }),
    repeat: (mode: ActivityRepeatMode) => withPayload("settings:repeat", { mode }),
    collaboration: (enabled: boolean) => withPayload("settings:collaboration", { enabled }),
    transferHost: (userId: string) => withPayload("host:transfer", { userId }),
    sync: () => noPayload("sync:request"),
    dismissError: () => setError(null)
  }), [noPayload, withPayload]);

  return { session, state, status, error, actions };
}
