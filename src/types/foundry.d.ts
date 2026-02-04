/**
 * Foundry VTT Type Declarations
 * Minimal declarations for the APIs used by this module
 */

declare global {
  // Basic jQuery type declaration for Foundry's bundled jQuery
  interface JQuery<TElement = HTMLElement> {
    find(selector: string): JQuery<TElement>;
    closest(selector: string): JQuery<TElement>;
    on(event: string, handler: (event: Event, ...args: any[]) => void): JQuery<TElement>;
    on(
      event: string,
      selector: string,
      handler: (event: Event, ...args: any[]) => void
    ): JQuery<TElement>;
    append(content: JQuery | string): JQuery<TElement>;
    val(): string | number | string[] | undefined;
    val(value: string | number | string[]): JQuery<TElement>;
    length: number;
  }

  // jQuery global function
  function $(selector: string | HTMLElement): JQuery;
  function $(html: string): JQuery;

  // Legacy AudioHelper class (fallback for older Foundry versions)
  const AudioHelper: {
    play(
      options: { src: string; volume?: number; autoplay?: boolean; loop?: boolean },
      push?: boolean
    ): Promise<any>;
  };
  const game: {
    modules: Map<string, { active: boolean }>;
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
          type: typeof FormApplication;
          restricted?: boolean;
        }
      ): void;
      get(module: string, key: string): unknown;
      set(module: string, key: string, value: unknown): Promise<unknown>;
    };
    user: {
      id: string;
      isGM: boolean;
    } | null;
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

  /**
   * MidiQOL global object for damage application
   */
  const MidiQOL: {
    applyTokenDamage(
      damageDetail: Array<{ damage: number; type: string }>,
      totalDamage: number,
      targets: Set<Token> | Token[],
      item?: Item | null,
      saves?: Set<Token> | null,
      options?: Record<string, any>
    ): Promise<any>;
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

  class Dialog {
    static confirm(options: {
      title: string;
      content: string;
      defaultYes?: boolean;
    }): Promise<boolean>;

    static prompt(options: {
      title: string;
      content: string;
      label?: string;
      callback?: (html: any) => any;
    }): Promise<any>;

    static wait(options: any): Promise<any>;
  }

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

  class FormApplication {
    static get defaultOptions(): FormApplicationOptions;
    get options(): FormApplicationOptions;
    getData(): object;
    render(force?: boolean): this;
    close(options?: object): Promise<void>;
    activateListeners(html: JQuery): void;
    _updateObject(event: Event, formData: object): Promise<void>;
  }

  interface FormApplicationOptions {
    id?: string;
    title?: string;
    template?: string;
    width?: number;
    height?: number | 'auto';
    classes?: string[];
    popOut?: boolean;
    minimizable?: boolean;
    resizable?: boolean;
    closeOnSubmit?: boolean;
    submitOnChange?: boolean;
    submitOnClose?: boolean;
    editable?: boolean;
  }

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
        type: number;
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
  }

  interface Scene {
    id: string;
    name: string;
  }

  interface Actor {
    id: string;
    name: string;
    uuid: string;
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
