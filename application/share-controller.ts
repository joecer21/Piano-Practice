import type { AssignmentInputs } from "../domain/assignment.js";
import {
  decodeShareFragment,
  encodeShareFragment,
  looksLikeShareFragment,
  shareUrl,
} from "../domain/share.js";

export type ShareLocationPort = {
  currentUrl(): string;
  fragment(): string;
  replaceFragment(fragment: string): void;
  subscribe(listener: () => void): () => void;
};

export type OpenLocationResult = { opened: boolean; error: string | null };

type ShareControllerOptions = {
  location: ShareLocationPort;
  currentInputs(): AssignmentInputs | null;
  openInputs(inputs: AssignmentInputs): boolean;
  beforeOpen(): void;
};

/** Owns assignment-link application behavior without knowing about `window` or React. */
export function createShareController(options: ShareControllerOptions) {
  const openLocation = (): OpenLocationResult => {
    const fragment = options.location.fragment();
    if (!looksLikeShareFragment(fragment)) return { opened: false, error: null };
    const current = options.currentInputs();
    if (current && fragment.slice(1) === encodeShareFragment(current)) {
      return { opened: true, error: null };
    }
    const decoded = decodeShareFragment(fragment);
    if (!decoded.ok) return { opened: false, error: `That link couldn't be opened: ${decoded.error}.` };
    options.beforeOpen();
    return options.openInputs(decoded.inputs)
      ? { opened: true, error: null }
      : { opened: false, error: "That link couldn't be opened." };
  };

  return {
    openLocation,
    subscribe(listener: (result: OpenLocationResult) => void): () => void {
      return options.location.subscribe(() => listener(openLocation()));
    },
    rememberCurrent(): void {
      const inputs = options.currentInputs();
      if (inputs) options.location.replaceFragment(encodeShareFragment(inputs));
    },
    currentShareUrl(): string | null {
      const inputs = options.currentInputs();
      return inputs ? shareUrl(inputs, options.location.currentUrl()) : null;
    },
  };
}
