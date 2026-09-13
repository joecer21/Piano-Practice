/**
 * Service-worker registration and the page's half of the update lifecycle
 * described in offline/service-worker.js.
 *
 * - The first install activates by itself; `offlineReady` turns true once a
 *   worker is active, so the app can say it now works offline.
 * - When a newer version finishes installing while this page is controlled by an
 *   older one, the page asks the waiting worker whether it already includes the
 *   script this page is running (a network-first reload fetched the new build
 *   before the new worker installed). If so, it activates silently - nothing on
 *   screen is out of date. If not, `update` becomes "available" and nothing
 *   happens until the learner chooses to reload: a practice session is never
 *   interrupted by a deploy.
 * - A version activated from another tab is handled the same way.
 * - A long-lived installed app checks for updates when it becomes visible again.
 */

export type OfflineUpdateState = "none" | "available" | "applying";

export type OfflineSnapshot = {
  /** True once a service worker is active, so the app opens without a network. */
  offlineReady: boolean;
  update: OfflineUpdateState;
  /** Content version of the active offline cache, when known. */
  cacheVersion: string | null;
};

export type OfflineSupport = {
  getSnapshot(): OfflineSnapshot;
  subscribe(listener: () => void): () => void;
  /** Activate a waiting version and reload into it. */
  applyUpdate(): void;
  dispose(): void;
};

type WorkerPort = Pick<ServiceWorker, "postMessage" | "state" | "addEventListener" | "removeEventListener">;

type RegistrationPort = {
  waiting: WorkerPort | null;
  installing: WorkerPort | null;
  active: WorkerPort | null;
  update(): Promise<unknown>;
  addEventListener(type: "updatefound", listener: () => void): void;
  removeEventListener(type: "updatefound", listener: () => void): void;
};

export type ServiceWorkerPort = {
  controller: WorkerPort | null;
  register(url: string): Promise<RegistrationPort>;
  addEventListener(type: "controllerchange", listener: () => void): void;
  removeEventListener(type: "controllerchange", listener: () => void): void;
};

export type PwaEnvironment = {
  production: boolean;
  document: Pick<Document, "readyState" | "visibilityState" | "addEventListener" | "removeEventListener">;
  events: Pick<Window, "addEventListener" | "removeEventListener">;
  serviceWorker: ServiceWorkerPort | null;
  /** URL of the running application script, to compare against a waiting version. */
  currentScriptUrl: string;
  reload(): void;
  now?: () => number;
};

export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const DESCRIBE_TIMEOUT_MS = 3000;

const INERT_SNAPSHOT: OfflineSnapshot = Object.freeze({
  offlineReady: false,
  update: "none",
  cacheVersion: null,
});

/** Register the generated worker for production builds and observe its updates. */
export function createOfflineSupport(environment: PwaEnvironment): OfflineSupport {
  const listeners = new Set<() => void>();
  if (!environment.production || !environment.serviceWorker) {
    return {
      getSnapshot: () => INERT_SNAPSHOT,
      subscribe: () => () => {},
      applyUpdate: () => {},
      dispose: () => {},
    };
  }

  const container = environment.serviceWorker;
  const now = environment.now ?? (() => Date.now());
  const cleanups: Array<() => void> = [];
  let snapshot: OfflineSnapshot = INERT_SNAPSHOT;
  let registration: RegistrationPort | null = null;
  let waiting: WorkerPort | null = null;
  let applying = false;
  let reloaded = false;
  let silentActivation = false;
  let lastUpdateCheck = now();
  let disposed = false;

  const publish = (patch: Partial<OfflineSnapshot>) => {
    const next = { ...snapshot, ...patch };
    if (
      next.offlineReady === snapshot.offlineReady &&
      next.update === snapshot.update &&
      next.cacheVersion === snapshot.cacheVersion
    )
      return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  const listen = <T extends string>(
    target: {
      addEventListener(type: T, l: () => void): void;
      removeEventListener(type: T, l: () => void): void;
    },
    type: T,
    listener: () => void,
  ) => {
    target.addEventListener(type, listener);
    cleanups.push(() => target.removeEventListener(type, listener));
  };

  const reloadOnce = () => {
    if (reloaded) return;
    reloaded = true;
    environment.reload();
  };

  const consider = async (worker: WorkerPort) => {
    // No controller: this is the first install, which activates by itself.
    if (disposed || !container.controller) return;
    const description = await describe(worker, environment.currentScriptUrl);
    if (disposed) return;
    if (description.includes) {
      silentActivation = true;
      worker.postMessage({ type: "SKIP_WAITING" });
      return;
    }
    waiting = worker;
    publish({ update: applying ? "applying" : "available" });
  };

  const watchInstalling = (worker: WorkerPort | null) => {
    if (!worker) return;
    const onStateChange = () => {
      if (worker.state === "installed") void consider(worker);
      if (worker.state === "installed" || worker.state === "redundant") {
        worker.removeEventListener("statechange", onStateChange);
      }
    };
    worker.addEventListener("statechange", onStateChange);
    cleanups.push(() => worker.removeEventListener("statechange", onStateChange));
  };

  const refreshReady = async (worker: WorkerPort | null) => {
    if (!worker) return;
    const description = await describe(worker, environment.currentScriptUrl);
    if (!disposed) publish({ offlineReady: true, cacheVersion: description.version });
  };

  const register = async () => {
    try {
      registration = await container.register("./sw.js");
    } catch (error) {
      console.warn("Offline support is unavailable", error);
      return;
    }
    if (disposed) return;
    const current = registration;
    listen(current, "updatefound", () => watchInstalling(current.installing));
    watchInstalling(current.installing);
    if (current.waiting) void consider(current.waiting);
    void refreshReady(current.active ?? container.controller);
  };

  listen(container, "controllerchange", () => {
    if (applying) {
      reloadOnce();
      return;
    }
    const controller = container.controller;
    if (silentActivation) {
      silentActivation = false;
      void refreshReady(controller);
      return;
    }
    // Activated from another tab (or the first install claiming this page).
    if (!controller) return;
    void (async () => {
      const description = await describe(controller, environment.currentScriptUrl);
      if (disposed) return;
      publish({
        offlineReady: true,
        cacheVersion: description.version,
        update: description.includes || !snapshot.offlineReady ? snapshot.update : "available",
      });
    })();
  });

  listen(environment.document, "visibilitychange", () => {
    if (environment.document.visibilityState !== "visible" || !registration) return;
    if (now() - lastUpdateCheck < UPDATE_CHECK_INTERVAL_MS) return;
    lastUpdateCheck = now();
    registration.update().catch(() => {});
  });

  if (environment.document.readyState === "complete") {
    void register();
  } else {
    listen(environment.events, "load", () => void register());
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    applyUpdate() {
      if (applying || snapshot.update === "none") return;
      applying = true;
      publish({ update: "applying" });
      if (waiting && waiting.state === "installed") waiting.postMessage({ type: "SKIP_WAITING" });
      else reloadOnce();
    },
    dispose() {
      disposed = true;
      while (cleanups.length) cleanups.pop()?.();
      listeners.clear();
    },
  };
}

/** Ask a worker for its version and whether it precaches `url`. Resolves even if it never answers. */
function describe(worker: WorkerPort, url: string): Promise<{ version: string | null; includes: boolean }> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve({ version: null, includes: false });
    }, DESCRIBE_TIMEOUT_MS);
    channel.port1.onmessage = (event: MessageEvent) => {
      clearTimeout(timer);
      channel.port1.close();
      const data = event.data as { version?: unknown; includes?: unknown } | null;
      resolve({
        version: typeof data?.version === "string" ? data.version : null,
        includes: data?.includes === true,
      });
    };
    try {
      worker.postMessage({ type: "DESCRIBE", url }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve({ version: null, includes: false });
    }
  });
}
