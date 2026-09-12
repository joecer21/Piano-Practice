import { eventsForPart } from "../domain/score-query.js";
import { assertValidScore } from "../domain/score.js";
import type { NoteExpression, PartId, Score } from "../domain/score.js";

export type ScheduledEventId = number | string;
export type PlaybackStatus = "playing" | "stopped" | "completed";

export type PlayRequest = {
  score: Score;
  parts: readonly PartId[];
  /** Inclusive, zero-based bar indexes. */
  barRange: readonly [startBar: number, endBar: number];
  /** 1 is normal speed; 0.5 takes twice as long without changing pitch. */
  rate: number;
  loop: boolean;
  countIn: boolean;
  tempoBpm: number;
};

export type ScheduledNoteGroup = {
  sessionId: string;
  part: PartId;
  eventIds: readonly string[];
  midis: readonly number[];
  sourceStartBeat: number;
  atBeat: number;
  durationBeats: number;
  rate: number;
  expression: NoteExpression;
};

export type PlaybackConfiguration = {
  tempoBpm: number;
  loop: boolean;
  loopStartBeat: number;
  loopEndBeat: number;
};

export type PlaybackSnapshot = {
  state: "started" | "stopped" | "paused";
  positionBeats: number;
};

export type PlaybackDriver = {
  init(): Promise<void>;
  dispose(): void;
  configure(configuration: PlaybackConfiguration): void;
  setTempo(tempoBpm: number): void;
  scheduleNote(group: ScheduledNoteGroup, onStart: () => void): ScheduledEventId;
  scheduleCountIn(atBeat: number, beatIndex: number, onStart: () => void): ScheduledEventId;
  scheduleEnd(atBeat: number, onEnd: () => void): ScheduledEventId;
  clear(eventId: ScheduledEventId): void;
  start(): void;
  stop(): void;
  release(parts: readonly PartId[]): void;
  getSnapshot(): PlaybackSnapshot;
};

export type PlaybackEventMap = {
  status: { sessionId: string; status: PlaybackStatus };
  position: { sessionId: string; beat: number };
  note: { sessionId: string; part: PartId; eventIds: readonly string[]; midis: readonly number[] };
  error: { sessionId: string; error: Error };
};

export type PlaybackSession = {
  readonly id: string;
  readonly request: Readonly<PlayRequest>;
  readonly status: PlaybackStatus;
  stop(): void;
};

type PlaybackEventType = keyof PlaybackEventMap;
type PlaybackListener<K extends PlaybackEventType> = (event: PlaybackEventMap[K]) => void;
type SessionRecord = {
  session: PlaybackSession;
  parts: readonly PartId[];
  scheduledIds: ScheduledEventId[];
  setStatus(status: PlaybackStatus): void;
};

export type AudioEngine = {
  init(): Promise<void>;
  dispose(): void;
  play(request: PlayRequest): PlaybackSession;
  stopAll(): void;
  setTempo(tempoBpm: number): void;
  getSnapshot(): PlaybackSnapshot;
  on<K extends PlaybackEventType>(type: K, listener: PlaybackListener<K>): () => void;
};

export function createAudioEngine(driver: PlaybackDriver): AudioEngine {
  const sessions = new Map<string, SessionRecord>();
  const listeners = new Map<PlaybackEventType, Set<(event: never) => void>>();
  let nextSessionId = 1;

  const emit = <K extends PlaybackEventType>(type: K, event: PlaybackEventMap[K]): void => {
    listeners.get(type)?.forEach((listener) => listener(event as never));
  };

  const releaseUnusedParts = (parts: readonly PartId[]): void => {
    const stillPlaying = new Set([...sessions.values()].flatMap((record) => record.parts));
    const releasable = parts.filter((part) => !stillPlaying.has(part));
    if (releasable.length) driver.release(releasable);
  };

  const finishSession = (sessionId: string, status: Exclude<PlaybackStatus, "playing">): void => {
    const record = sessions.get(sessionId);
    if (!record) return;
    sessions.delete(sessionId);
    record.scheduledIds.forEach((eventId) => driver.clear(eventId));
    record.scheduledIds.length = 0;
    record.setStatus(status);
    releaseUnusedParts(record.parts);
    if (sessions.size === 0) driver.stop();
    emit("status", { sessionId, status });
  };

  return {
    init() {
      return driver.init();
    },

    dispose() {
      this.stopAll();
      driver.dispose();
    },

    play(request) {
      const normalized = normalizeRequest(request);
      const sessionId = `playback-${nextSessionId++}`;
      const scheduledIds: ScheduledEventId[] = [];
      let status: PlaybackStatus = "playing";
      const session: PlaybackSession = {
        id: sessionId,
        request: normalized,
        get status() {
          return status;
        },
        stop() {
          finishSession(sessionId, "stopped");
        },
      };
      const record: SessionRecord = {
        session,
        parts: normalized.parts,
        scheduledIds,
        setStatus(nextStatus) {
          status = nextStatus;
        },
      };

      const beatsPerBar = normalized.score.meta.beatsPerBar;
      const sourceStartBeat = normalized.barRange[0] * beatsPerBar;
      const sourceEndBeat = (normalized.barRange[1] + 1) * beatsPerBar;
      const countInBeats = normalized.countIn ? beatsPerBar : 0;
      const playbackLengthBeats = (sourceEndBeat - sourceStartBeat) / normalized.rate;

      try {
        driver.configure({
          tempoBpm: normalized.tempoBpm,
          loop: normalized.loop,
          loopStartBeat: countInBeats,
          loopEndBeat: countInBeats + playbackLengthBeats,
        });

        if (normalized.countIn) {
          for (let beatIndex = 0; beatIndex < beatsPerBar; beatIndex += 1) {
            scheduledIds.push(
              driver.scheduleCountIn(beatIndex, beatIndex, () => {
                emit("position", { sessionId, beat: beatIndex });
              }),
            );
          }
        }

        const groups = groupNotes(normalized.score, normalized.parts, sourceStartBeat, sourceEndBeat);
        groups.forEach((group) => {
          const scheduledGroup: ScheduledNoteGroup = {
            ...group,
            sessionId,
            atBeat: countInBeats + (group.sourceStartBeat - sourceStartBeat) / normalized.rate,
            durationBeats: group.durationBeats / normalized.rate,
            rate: normalized.rate,
          };
          scheduledIds.push(
            driver.scheduleNote(scheduledGroup, () => {
              emit("position", { sessionId, beat: scheduledGroup.atBeat });
              emit("note", {
                sessionId,
                part: scheduledGroup.part,
                eventIds: scheduledGroup.eventIds,
                midis: scheduledGroup.midis,
              });
            }),
          );
        });

        if (!normalized.loop) {
          scheduledIds.push(
            driver.scheduleEnd(countInBeats + playbackLengthBeats, () => {
              finishSession(sessionId, "completed");
            }),
          );
        }

        sessions.set(sessionId, record);
        if (sessions.size === 1) driver.start();
        emit("status", { sessionId, status: "playing" });
        return session;
      } catch (cause) {
        const wasActive = sessions.delete(sessionId);
        scheduledIds.forEach((eventId) => driver.clear(eventId));
        scheduledIds.length = 0;
        status = "stopped";
        if (wasActive) {
          releaseUnusedParts(normalized.parts);
          if (sessions.size === 0) driver.stop();
        }
        const error = cause instanceof Error ? cause : new Error(String(cause));
        emit("error", { sessionId, error });
        throw error;
      }
    },

    stopAll() {
      const sessionIds = [...sessions.keys()];
      sessionIds.forEach((sessionId) => finishSession(sessionId, "stopped"));
      if (sessionIds.length === 0) driver.stop();
    },

    setTempo(tempoBpm) {
      assertTempo(tempoBpm);
      driver.setTempo(tempoBpm);
    },

    getSnapshot() {
      return driver.getSnapshot();
    },

    on(type, listener) {
      const typedListener = listener as (event: never) => void;
      let bucket = listeners.get(type);
      if (!bucket) {
        bucket = new Set();
        listeners.set(type, bucket);
      }
      bucket.add(typedListener);
      return () => bucket?.delete(typedListener);
    },
  };
}

function normalizeRequest(request: PlayRequest): Readonly<PlayRequest> {
  assertValidScore(request?.score);
  if (!Array.isArray(request.parts) || request.parts.length === 0) {
    throw new TypeError("playback requires at least one part");
  }
  const parts = [...new Set(request.parts)];
  if (parts.some((part) => part !== "lh" && part !== "rh")) {
    throw new TypeError("playback parts must be lh or rh");
  }
  const [startBar, endBar] = request.barRange ?? [];
  if (
    !Number.isInteger(startBar) ||
    !Number.isInteger(endBar) ||
    startBar < 0 ||
    endBar < startBar ||
    endBar >= request.score.meta.bars
  ) {
    throw new RangeError("barRange must be an inclusive range inside the score");
  }
  if (!Number.isFinite(request.rate) || request.rate <= 0 || request.rate > 4) {
    throw new RangeError("rate must be greater than 0 and no more than 4");
  }
  assertTempo(request.tempoBpm);
  if (typeof request.loop !== "boolean" || typeof request.countIn !== "boolean") {
    throw new TypeError("loop and countIn must be booleans");
  }
  return Object.freeze({ ...request, parts: Object.freeze(parts) });
}

function assertTempo(tempoBpm: number): void {
  if (!Number.isFinite(tempoBpm) || tempoBpm < 20 || tempoBpm > 300) {
    throw new RangeError("tempoBpm must be from 20 to 300");
  }
}

type GroupedNote = {
  part: PartId;
  eventIds: string[];
  midis: number[];
  sourceStartBeat: number;
  durationBeats: number;
  expression: NoteExpression;
};

function groupNotes(
  score: Score,
  parts: readonly PartId[],
  startBeat: number,
  endBeat: number,
): GroupedNote[] {
  const groups = new Map<string, GroupedNote>();
  parts.forEach((part) => {
    eventsForPart(score, part, [startBeat, endBeat]).forEach((event) => {
      if (event.kind !== "note") return;
      const key = [
        part,
        event.startBeat,
        event.durationBeats,
        event.expression.accent,
        event.expression.ghost,
        event.expression.swingWeight,
      ].join(":");
      const existing = groups.get(key);
      if (existing) {
        existing.eventIds.push(event.id);
        existing.midis.push(event.midi);
        return;
      }
      groups.set(key, {
        part,
        eventIds: [event.id],
        midis: [event.midi],
        sourceStartBeat: event.startBeat,
        durationBeats: event.durationBeats,
        expression: { ...event.expression },
      });
    });
  });
  return [...groups.values()].sort(
    (a, b) => a.sourceStartBeat - b.sourceStartBeat || a.part.localeCompare(b.part),
  );
}
