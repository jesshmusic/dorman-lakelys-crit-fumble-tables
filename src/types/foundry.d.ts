/**
 * Foundry VTT Type Declarations
 * Minimal declarations for the APIs used by this module
 */

declare global {
  // Note: jQuery global removed during the v14 migration. The module no longer
  // depends on Foundry's bundled jQuery; all DOM manipulation uses native APIs.
  // The bare `AudioHelper` global is a v12 fallback that the runtime code
  // checks for via globalThis — no ambient declaration is needed.
  const game: {
    modules: Map<string, { active: boolean; version?: string }>;
    settings: {
      register(module: string, key: string, options: any): void;
      registerMenu(
        module: string,
        key: string,
        options: {
          name: string;
          label: string;
          hint?: string;
          icon?: string;
          // v14: accepts any ApplicationV2 (or legacy FormApplication) constructor.
          type: new (...args: any[]) => any;
          restricted?: boolean;
        }
      ): void;
      get(module: string, key: string): unknown;
      set(module: string, key: string, value: unknown): Promise<unknown>;
    };
    user: {
      id: string;
      isGM: boolean;
      /** Tokens the user currently has targeted (may be absent in tests) */
      targets?: Set<Token>;
    } | null;
    users: {
      /** The GM the module relays privileged work to; null when no GM is connected */
      activeGM: { id: string; name?: string } | null;
      get(id: string): any;
      [key: string]: any;
    };
    /** Foundry's socket.io channel; the module listens on `module.<MODULE_ID>` */
    socket: {
      on(event: string, handler: (...args: any[]) => void): void;
      emit(event: string, ...args: any[]): void;
      [key: string]: any;
    };
    tables: Collection<RollTable> | null;
    folders: Collection<Folder> | null;
    i18n: {
      localize(key: string): string;
      format(key: string, data: Record<string, any>): string;
    };
    combat?: {
      round: number;
      turn: number;
    };
    ready: boolean;
  };

  const ui: {
    notifications: {
      info(message: string, options?: { permanent?: boolean }): void;
      warn(message: string, options?: { permanent?: boolean }): void;
      error(message: string, options?: { permanent?: boolean }): void;
      notify(message: string, type?: string, options?: { permanent?: boolean }): void;
    };
  };

  const Hooks: {
    on(hook: string, callback: (...args: any[]) => void): number;
    once(hook: string, callback: (...args: any[]) => void): number;
    off(hook: string, id: number): void;
    call(hook: string, ...args: any[]): boolean;
    callAll(hook: string, ...args: any[]): boolean;
  };

  const foundry: {
    utils: {
      randomID(length?: number): string;
      mergeObject(original: any, other: any, options?: any): any;
    };
    applications: {
      api: {
        ApplicationV2: any;
        HandlebarsApplicationMixin: any;
      };
    };
    audio: {
      AudioHelper: {
        play(
          options: { src: string; volume?: number; autoplay?: boolean; loop?: boolean },
          push?: boolean
        ): Promise<any>;
      };
    };
  };

  const canvas: {
    scene: Scene | null;
    tokens: {
      placeables: Token[];
    };
  };

  const CONST: {
    /** @deprecated Use CHAT_MESSAGE_STYLES instead */
    CHAT_MESSAGE_TYPES: {
      OTHER: number;
      OOC: number;
      IC: number;
      EMOTE: number;
      WHISPER: number;
      ROLL: number;
    };
    CHAT_MESSAGE_STYLES: {
      OTHER: number;
      OOC: number;
      IC: number;
      EMOTE: number;
    };
    ACTIVE_EFFECT_MODES: {
      CUSTOM: number;
      MULTIPLY: number;
      ADD: number;
      DOWNGRADE: number;
      UPGRADE: number;
      OVERRIDE: number;
    };
  };

  // Note: legacy `Dialog` class declaration removed in v14 migration. Use
  // foundry.applications.api.DialogV2 (typed loosely via `(foundry as any)`).

  class ChatMessage {
    static create(data: {
      content: string;
      speaker?: any;
      /** @deprecated Use style instead */
      type?: number;
      style?: number;
      whisper?: string[];
      flags?: Record<string, any>;
    }): Promise<ChatMessage>;

    static getSpeaker(options?: { actor?: Actor; token?: Token }): any;
  }

  // Note: legacy `FormApplication` class declaration removed in v14 migration.
  // Settings menu entries now use foundry.applications.api.ApplicationV2
  // subclasses (typed loosely via `(foundry as any)`).

  class Roll {
    constructor(formula: string, data?: any);
    total: number;
    evaluate(options?: { async?: boolean }): Promise<Roll>;
    toMessage(options?: any): Promise<ChatMessage>;
  }

  interface Folder {
    id: string;
    name: string;
    type: string;
    parent: Folder | null;
  }

  const Folder: {
    create(data: {
      name: string;
      type: string;
      parent: string | null;
    }): Promise<Folder | undefined>;
  };

  interface RollTable {
    id: string;
    name: string;
    folder: Folder | null;
    draw(options?: { displayChat?: boolean }): Promise<{ results: RollTableResult[] }>;
    delete(): Promise<RollTable>;
  }

  const RollTable: {
    create(data: {
      name: string;
      description?: string;
      img?: string;
      formula?: string;
      replacement?: boolean;
      displayRoll?: boolean;
      folder?: string | null;
      results?: Array<{
        type: 'text' | 'document' | 'pack';
        text: string;
        img?: string;
        weight: number;
        range: [number, number];
        flags?: Record<string, unknown>;
      }>;
      flags?: Record<string, unknown>;
    }): Promise<RollTable | undefined>;
  };

  interface RollTableResult {
    /** @deprecated Use name instead */
    text?: string;
    name: string;
    description: string;
    img?: string;
    flags?: Record<string, any>;
    /** Raw source data; read _source.text to get the legacy value without the deprecated getter */
    _source?: { text?: string; description?: string; name?: string };
  }

  interface Scene {
    id: string;
    name: string;
  }

  interface Actor {
    id: string;
    name: string;
    uuid: string;
    /** Raw actor flags, including keys written by active effects (`flags.<scope>.*`) */
    flags?: Record<string, any>;
    system: {
      details?: {
        level?: number;
        cr?: number;
      };
      attributes?: {
        hp?: {
          value: number;
          max: number;
        };
        ac?: {
          value?: number;
        };
      };
    };
    items: Collection<Item>;
    statuses: Set<string>;
    getActiveTokens(): Token[];
    applyDamage(amount: number, options?: any): Promise<Actor>;
    createEmbeddedDocuments(type: string, data: any[]): Promise<any[]>;
    toggleStatusEffect(
      statusId: string,
      options?: { active?: boolean; overlay?: boolean }
    ): Promise<boolean>;
  }

  interface Token {
    id: string;
    name: string;
    actor: Actor | null;
    document: any;
  }

  interface Item {
    id: string;
    name: string;
    type: string;
    system: {
      actionType?: string;
      attackBonus?: number;
      damage?: {
        parts: Array<[string, string]>;
      };
      equipped?: boolean;
    };
    update?(data: Record<string, any>): Promise<Item>;
  }

  interface Collection<T> extends Map<string, T> {
    getName(name: string): T | undefined;
    filter(fn: (item: T) => boolean): T[];
    find(fn: (item: T) => boolean): T | undefined;
  }
}

export {};
