/**
 * GM Socket Service
 *
 * A tiny request/response relay over Foundry's module socket so that the
 * rolling client can have a GM apply document changes it lacks permission for.
 *
 * WHY: this module runs on the client that rolled. When a PLAYER crits an NPC,
 * every effect lands on a token the player does not own, and Foundry rejects
 * the write ("User X lacks permission to create ActiveEffect in parent
 * ActorDelta"). Midi-QOL used to provide this relay over socketlib; without
 * Midi we need our own, and it is small enough not to warrant socketlib.
 *
 * Only the ACTIVE GM (`game.users.activeGM`) executes requests, so a table
 * with two GMs connected applies each effect exactly once. Every request
 * carries an id; the executing GM answers with a response carrying the same
 * id, which the originator resolves. Other clients ignore both.
 */

import { MODULE_ID, LOG_PREFIX } from '../constants';

/** Actions the GM side knows how to execute. */
export type GmSocketAction = 'createEffects' | 'toggleStatusEffect';

export interface CreateEffectsPayload {
  actorUuid: string;
  effects: Record<string, any>[];
  options?: Record<string, any>;
}

export interface ToggleStatusEffectPayload {
  actorUuid: string;
  statusId: string;
  options?: Record<string, any>;
}

export type GmSocketPayload = CreateEffectsPayload | ToggleStatusEffectPayload;

interface SocketRequest {
  type: 'request';
  id: string;
  action: GmSocketAction;
  payload: GmSocketPayload;
  /** The requesting user, so the response can name who it is for. */
  userId: string;
}

interface SocketResponse {
  type: 'response';
  id: string;
  ok: boolean;
  error?: string;
  /** The user the response is addressed to (the original requester). */
  userId: string;
}

type SocketMessage = SocketRequest | SocketResponse;

interface PendingRequest {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Module-owned socket used to relay privileged document writes to the GM
 */
export class GmSocket {
  /** Socket channel. Foundry requires the `module.<id>` form for modules. */
  static readonly CHANNEL = `module.${MODULE_ID}`;

  /** How long a client waits for the GM to answer before giving up. */
  static readonly TIMEOUT_MS = 10_000;

  /** Requests this client has emitted and is still waiting on, by id. */
  private static pending = new Map<string, PendingRequest>();

  private static registered = false;

  /**
   * Subscribe to the module channel. Call once on `ready`, on every client —
   * players need it to receive responses, GMs to receive requests.
   */
  static register(): void {
    if (this.registered) {
      return;
    }
    const socket = (game as any).socket;
    if (!socket?.on) {
      console.warn(`${LOG_PREFIX} game.socket unavailable — GM relay disabled`);
      return;
    }
    socket.on(this.CHANNEL, (message: SocketMessage) => {
      void this.handleMessage(message);
    });
    this.registered = true;
    console.log(`${LOG_PREFIX} GM socket registered on ${this.CHANNEL}`);
  }

  /** Test seam: forget registration and drop any in-flight requests. */
  static unregister(): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
    }
    this.pending.clear();
    this.registered = false;
  }

  /**
   * Run `action` with GM permissions.
   *
   * A GM runs it locally. A player emits a request and waits for the active
   * GM's response; with no GM connected the request is dropped with a warning
   * (there is nobody who could apply it), which mirrors what Midi did.
   *
   * @throws when the GM reports a failure or does not answer in time
   */
  static async executeAsGM(action: GmSocketAction, payload: GmSocketPayload): Promise<void> {
    if ((game as any).user?.isGM) {
      await this.execute(action, payload);
      return;
    }

    const activeGM = (game as any).users?.activeGM;
    if (!activeGM) {
      console.warn(`${LOG_PREFIX} Cannot run "${action}" as GM — no GM is connected.`);
      (globalThis as any).ui?.notifications?.warn?.(
        'Crit/Fumble: no GM is connected, so the effect could not be applied.'
      );
      return;
    }

    const socket = (game as any).socket;
    if (!socket?.emit) {
      console.warn(`${LOG_PREFIX} Cannot run "${action}" as GM — game.socket unavailable.`);
      return;
    }

    const id = this.newRequestId();
    const request: SocketRequest = {
      type: 'request',
      id,
      action,
      payload,
      userId: (game as any).user?.id
    };

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(`${LOG_PREFIX} GM did not answer "${action}" within ${this.TIMEOUT_MS}ms`)
        );
      }, this.TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      socket.emit(this.CHANNEL, request);
    });
  }

  /**
   * Dispatch an incoming socket message. Public so tests can drive it
   * directly instead of digging the listener out of the `game.socket.on` mock.
   */
  static async handleMessage(message: SocketMessage): Promise<void> {
    if (!message || typeof message !== 'object') {
      return;
    }
    if (message.type === 'request') {
      await this.handleRequest(message);
    } else if (message.type === 'response') {
      this.handleResponse(message);
    }
  }

  private static async handleRequest(request: SocketRequest): Promise<void> {
    // Only the active GM executes, so several connected GMs apply once, not N times.
    const activeGM = (game as any).users?.activeGM;
    if (!activeGM || (game as any).user?.id !== activeGM.id) {
      return;
    }

    let ok = true;
    let error: string | undefined;
    try {
      await this.execute(request.action, request.payload);
    } catch (err) {
      ok = false;
      error = err instanceof Error ? err.message : String(err);
      console.error(`${LOG_PREFIX} GM relay "${request.action}" failed:`, err);
    }

    const response: SocketResponse = {
      type: 'response',
      id: request.id,
      ok,
      error,
      userId: request.userId
    };
    (game as any).socket?.emit?.(this.CHANNEL, response);
  }

  private static handleResponse(response: SocketResponse): void {
    // Responses for requests this client never made (or has already timed out) are noise.
    const entry = this.pending.get(response.id);
    if (!entry) {
      return;
    }
    this.pending.delete(response.id);
    clearTimeout(entry.timer);
    if (response.ok) {
      entry.resolve();
    } else {
      entry.reject(new Error(response.error ?? `${LOG_PREFIX} GM relay request failed`));
    }
  }

  /**
   * Execute an action locally. Runs on the GM (for relayed requests) or on
   * any client that already has permission (the local short-circuit).
   */
  static async execute(action: GmSocketAction, payload: GmSocketPayload): Promise<void> {
    const actor: any = await (globalThis as any).fromUuid?.(payload?.actorUuid);
    if (!actor) {
      throw new Error(`Actor ${payload?.actorUuid} not found`);
    }

    switch (action) {
      case 'createEffects': {
        const { effects, options } = payload as CreateEffectsPayload;
        if (options && Object.keys(options).length > 0) {
          await actor.createEmbeddedDocuments('ActiveEffect', effects, options);
        } else {
          await actor.createEmbeddedDocuments('ActiveEffect', effects);
        }
        return;
      }
      case 'toggleStatusEffect': {
        const { statusId, options } = payload as ToggleStatusEffectPayload;
        await actor.toggleStatusEffect(statusId, options ?? { active: true });
        return;
      }
      default:
        throw new Error(`Unknown GM relay action "${String(action)}"`);
    }
  }

  private static newRequestId(): string {
    const random = (globalThis as any).foundry?.utils?.randomID?.();
    return random ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
