export type PwaEnvironment = {
  production: boolean;
  document: Pick<Document, "readyState">;
  events: Pick<Window, "addEventListener" | "removeEventListener">;
  serviceWorker: Pick<ServiceWorkerContainer, "register"> | null;
};

/** Register the generated worker only for production builds, with a disposable pending listener. */
export function registerOfflineSupport(environment: PwaEnvironment): () => void {
  if (!environment.production || !environment.serviceWorker) return () => {};
  const register = () => {
    void environment.serviceWorker
      ?.register("./sw.js")
      .catch((error: unknown) => console.warn("Offline support is unavailable", error));
  };
  if (environment.document.readyState === "complete") {
    register();
    return () => {};
  }
  environment.events.addEventListener("load", register, { once: true });
  return () => environment.events.removeEventListener("load", register);
}
