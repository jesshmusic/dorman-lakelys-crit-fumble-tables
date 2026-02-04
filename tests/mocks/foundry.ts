/**
 * Foundry VTT Mock Implementations
 * Provides mock objects for testing without a running Foundry instance
 */

import { jest } from '@jest/globals';

/**
 * Mock game object
 */
export function createMockGame(overrides?: Partial<typeof game>): typeof game {
  // Create a mock modules Map with a mocked get function
  const modulesMap = new Map([['midi-qol', { active: true, version: '1.0.0' }]]);
  (modulesMap as any).get = jest.fn((id: string) => {
    if (id === 'midi-qol') return { active: true, version: '1.0.0' };
    if (id === 'dorman-lakelys-crit-fumble-tables') return { active: true, version: '1.0.1' };
    return undefined;
  });

  return {
    modules: modulesMap,
    settings: {
      register: jest.fn(),
      registerMenu: jest.fn(),
      get: jest.fn((_module: string, key: string) => {
        // Default settings values for tests
        const defaults: Record<string, any> = {
          enabled: true,
          enableCrits: true,
          enableFumbles: true,
          applyEffects: true,
          useActorLevel: true,
          fixedTier: '1',
          showChatMessages: true,
          tablesImported: false,
          tablesVersion: ''
        };
        return defaults[key];
      }),
      set: jest.fn<any>().mockResolvedValue(undefined)
    },
    user: {
      id: 'test-user-id',
      isGM: true
    },
    tables: createMockTables(),
    folders: createMockFolders(),
    i18n: {
      localize: jest.fn((key: string) => key),
      format: jest.fn((key: string, _data: Record<string, any>) => key)
    },
    combat: {
      round: 1,
      turn: 0
    },
    ready: true,
    ...overrides
  } as any;
}

/**
 * Mock folders collection
 */
export function createMockFolders(): Map<string, any> & { find: (fn: (f: any) => boolean) => any } {
  const folders = new Map<string, any>();

  // Add find method to mimic Foundry's Collection
  (folders as any).find = (fn: (f: any) => boolean) => {
    for (const folder of folders.values()) {
      if (fn(folder)) return folder;
    }
    return undefined;
  };

  return folders as any;
}

/**
 * Mock tables collection
 */
export function createMockTables(): Map<string, any> & {
  getName: (name: string) => any;
  filter: (fn: (t: any) => boolean) => any[];
} {
  const tables = new Map<string, any>();

  // Add mock tables for testing
  const mockTableNames = [
    'tier1-melee-crits',
    'tier1-melee-fumbles',
    'tier1-ranged-crits',
    'tier1-ranged-fumbles',
    'tier1-spell-crits',
    'tier1-spell-fumbles',
    'tier2-melee-crits',
    'tier2-melee-fumbles',
    'tier2-ranged-crits',
    'tier2-ranged-fumbles',
    'tier2-spell-crits',
    'tier2-spell-fumbles'
  ];

  mockTableNames.forEach(name => {
    tables.set(name, createMockTable(name));
  });

  // Add getName method to mimic Foundry's Collection
  (tables as any).getName = (name: string) => tables.get(name);

  // Add filter method to mimic Foundry's Collection
  (tables as any).filter = (fn: (t: any) => boolean) => {
    const results: any[] = [];
    for (const table of tables.values()) {
      if (fn(table)) results.push(table);
    }
    return results;
  };

  return tables as any;
}

/**
 * Create a mock RollTable
 */
export function createMockTable(name: string): any {
  const mockDraw = jest.fn<() => Promise<any>>().mockResolvedValue({
    results: [
      {
        text: 'Test Result - A test result description',
        img: 'icons/svg/dice-target.svg',
        flags: {
          'dorman-lakelys-crit-fumble-tables': {
            effectType: 'none'
          }
        }
      }
    ]
  });
  return {
    name,
    draw: mockDraw
  };
}

/**
 * Mock ui object
 */
export function createMockUI(): typeof ui {
  return {
    notifications: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      notify: jest.fn()
    }
  } as any;
}

/**
 * Mock Hooks object
 */
export function createMockHooks(): typeof Hooks {
  return {
    on: jest.fn().mockReturnValue(1),
    once: jest.fn().mockReturnValue(1),
    off: jest.fn(),
    call: jest.fn().mockReturnValue(true),
    callAll: jest.fn().mockReturnValue(true)
  } as any;
}

/**
 * Mock foundry utilities
 */
export function createMockFoundry(): typeof foundry {
  return {
    utils: {
      randomID: jest.fn(() => 'mock-random-id-' + Math.random().toString(36).substr(2, 9)),
      mergeObject: jest.fn((original: any, other: any) => ({ ...original, ...other }))
    },
    applications: {
      api: {
        ApplicationV2: class MockApplicationV2 {
          constructor(_options?: any) {}
          render = jest.fn();
          close = jest.fn();
        },
        HandlebarsApplicationMixin: {}
      }
    },
    audio: {
      AudioHelper: {
        play: jest.fn<() => Promise<any>>().mockResolvedValue({})
      }
    }
  } as any;
}

/**
 * Mock MidiQOL global object
 */
export function createMockMidiQOL(): typeof MidiQOL {
  return {
    applyTokenDamage: jest.fn<() => Promise<any>>().mockResolvedValue({})
  } as any;
}

/**
 * Mock ChatMessage class
 */
export function createMockChatMessage(): typeof ChatMessage {
  return {
    create: jest.fn<() => Promise<any>>().mockResolvedValue({}),
    getSpeaker: jest.fn<() => any>().mockReturnValue({})
  } as any;
}

/**
 * Mock Roll class
 */
export function createMockRoll(): typeof Roll {
  return class MockRoll {
    total: number = 10;
    formula: string;

    constructor(formula: string) {
      this.formula = formula;
      // Parse simple formulas like "2d6" for testing
      const match = formula.match(/(\d+)d(\d+)/);
      if (match) {
        const numDice = parseInt(match[1], 10);
        const faces = parseInt(match[2], 10);
        this.total = Math.floor(numDice * (faces / 2 + 0.5));
      }
    }

    async evaluate(_options?: any): Promise<MockRoll> {
      return this;
    }

    async toMessage(_options?: any): Promise<any> {
      return {};
    }
  } as any;
}

/**
 * Mock CONST object
 */
export function createMockCONST(): typeof CONST {
  return {
    CHAT_MESSAGE_TYPES: {
      OTHER: 0,
      OOC: 1,
      IC: 2,
      EMOTE: 3,
      WHISPER: 4,
      ROLL: 5
    },
    CHAT_MESSAGE_STYLES: {
      OTHER: 0,
      OOC: 1,
      IC: 2,
      EMOTE: 3
    },
    ACTIVE_EFFECT_MODES: {
      CUSTOM: 0,
      MULTIPLY: 1,
      ADD: 2,
      DOWNGRADE: 3,
      UPGRADE: 4,
      OVERRIDE: 5
    }
  } as any;
}

/**
 * Mock Actor
 */
export function createMockActor(overrides?: Partial<Actor>): Actor {
  return {
    id: 'test-actor-id',
    name: 'Test Actor',
    uuid: 'Actor.test-actor-id',
    system: {
      details: {
        level: 5
      },
      attributes: {
        hp: {
          value: 50,
          max: 50
        }
      }
    },
    items: new Map() as any,
    statuses: new Set<string>(),
    getActiveTokens: jest.fn<() => any[]>().mockReturnValue([]),
    applyDamage: jest.fn<() => Promise<any>>().mockResolvedValue({}),
    createEmbeddedDocuments: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    toggleStatusEffect: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
    ...overrides
  } as any;
}

/**
 * Mock Token
 */
export function createMockToken(overrides?: Partial<Token>): Token {
  const actor = createMockActor();
  return {
    id: 'test-token-id',
    name: 'Test Token',
    actor,
    document: {},
    ...overrides
  } as any;
}

/**
 * Mock Item (weapon or spell)
 */
export function createMockItem(overrides?: any): any {
  return {
    id: 'test-item-id',
    name: 'Test Weapon',
    type: 'weapon',
    system: {
      actionType: 'mwak',
      damage: {
        parts: [['1d8', 'slashing']]
      }
    },
    ...overrides
  };
}

/**
 * Mock Midi-QOL Workflow
 */
export function createMockWorkflow(overrides?: any): any {
  return {
    actor: createMockActor(),
    item: {
      type: 'weapon',
      name: 'Longsword',
      system: {
        actionType: 'mwak',
        attackBonus: 5,
        damage: {
          parts: [['1d8+3', 'slashing']]
        }
      }
    },
    targets: new Set([createMockToken()]),
    hitTargets: new Set([createMockToken()]),
    attackRoll: {
      total: 25,
      formula: '1d20+5',
      terms: [
        {
          faces: 20,
          results: [{ result: 20, active: true }]
        }
      ]
    },
    isCritical: true,
    isFumble: false,
    ...overrides
  };
}

/**
 * Mock Folder class
 */
export function createMockFolder(): typeof Folder {
  return {
    create: jest.fn<() => Promise<any>>().mockResolvedValue({
      id: 'mock-folder-id',
      name: "Dorman Lakely's Crit/Fumble Tables",
      type: 'RollTable',
      parent: null
    })
  } as any;
}

/**
 * Mock RollTable class (static methods)
 */
export function createMockRollTableClass(): typeof RollTable {
  return {
    create: jest.fn<() => Promise<any>>().mockResolvedValue({
      id: 'mock-table-id',
      name: 'mock-table',
      folder: null,
      draw: jest.fn<any>().mockResolvedValue({ results: [] }),
      delete: jest.fn<any>().mockResolvedValue({})
    })
  } as any;
}

/**
 * Mock FormApplication class
 */
export function createMockFormApplication(): typeof FormApplication {
  return class MockFormApplication {
    static get defaultOptions() {
      return {
        id: 'mock-form-app',
        title: 'Mock Form',
        template: '',
        width: 400
      };
    }
    get options() {
      return (this.constructor as any).defaultOptions;
    }
    getData() {
      return {};
    }
    render(_force?: boolean) {
      return this;
    }
    async close(_options?: object) {}
    activateListeners(_html: any) {}
    async _updateObject(_event: Event, _formData: object) {}
  } as any;
}

/**
 * Mock Dialog class
 */
export function createMockDialog(): any {
  return {
    confirm: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
    prompt: jest.fn<() => Promise<string>>().mockResolvedValue(''),
    wait: jest.fn<() => Promise<any>>().mockResolvedValue(null)
  };
}

/**
 * Mock jQuery function
 */
export function createMockJQuery(): any {
  const mockElement = {
    find: jest.fn().mockReturnThis(),
    closest: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis(),
    append: jest.fn().mockReturnThis(),
    val: jest.fn().mockReturnValue(''),
    length: 1
  };

  const $ = jest.fn().mockReturnValue(mockElement);
  return $;
}

/**
 * Mock AudioHelper class
 */
export function createMockAudioHelper(): any {
  return {
    play: jest.fn<() => Promise<any>>().mockResolvedValue({})
  };
}

/**
 * Set up all global mocks
 */
export function setupMocks(): void {
  (global as any).game = createMockGame();
  (global as any).ui = createMockUI();
  (global as any).Hooks = createMockHooks();
  (global as any).foundry = createMockFoundry();
  (global as any).ChatMessage = createMockChatMessage();
  (global as any).Roll = createMockRoll();
  (global as any).CONST = createMockCONST();
  (global as any).Folder = createMockFolder();
  (global as any).RollTable = createMockRollTableClass();
  (global as any).FormApplication = createMockFormApplication();
  (global as any).Dialog = createMockDialog();
  (global as any).MidiQOL = createMockMidiQOL();
  (global as any).$ = createMockJQuery();
  (global as any).AudioHelper = createMockAudioHelper();
  (global as any).HTMLElement = class MockHTMLElement {};
  (global as any).canvas = {
    scene: { id: 'test-scene', name: 'Test Scene' },
    tokens: { placeables: [] }
  };

  // Mock global fetch for loading JSON files
  (global as any).fetch = jest.fn().mockImplementation((url: string) => {
    // Return a mock response with table data
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          name: 'Mock Table',
          description: 'Test description',
          img: 'icons/test.webp',
          formula: '1d100',
          results: [
            {
              type: 0,
              text: 'Test Result',
              weight: 100,
              range: [1, 100],
              img: 'icons/test.svg',
              flags: {
                'dorman-lakelys-crit-fumble-tables': {
                  effectType: 'none'
                }
              }
            }
          ]
        })
    });
  });
}

/**
 * Reset all mocks between tests
 */
export function resetMocks(): void {
  jest.clearAllMocks();
  jest.resetModules();
  setupMocks();
}
