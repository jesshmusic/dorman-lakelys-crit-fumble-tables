/**
 * GrantsEnforcer Service Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { resetMocks, createMockToken } from '../mocks/foundry';

const MODULE_ID = 'dorman-lakelys-crit-fumble-tables';

describe('GrantsEnforcer', () => {
  let GrantsEnforcer: typeof import('../../src/services/GrantsEnforcer').GrantsEnforcer;

  beforeEach(async () => {
    resetMocks();
    ({ GrantsEnforcer } = await import('../../src/services/GrantsEnforcer'));
  });

  afterEach(() => {
    GrantsEnforcer.unregister();
  });

  /** A token whose actor carries the module's grants flag. */
  const grantingToken = (
    type: 'advantage' | 'disadvantage',
    scope: string,
    value?: unknown
  ): any => {
    const token = createMockToken();
    (token.actor as any).flags = {
      [MODULE_ID]: { grants: { [type]: { attack: { [scope]: value } } } }
    };
    return token;
  };

  const setTargets = (...tokens: any[]) => {
    (game.user as any).targets = new Set(tokens);
  };

  /** A minimal dnd5e.preRollAttackV2 config. */
  const attackConfig = (overrides: any = {}) => ({
    subject: { actionType: 'mwak', item: { type: 'weapon', system: { actionType: 'mwak' } } },
    rolls: [{ options: { advantage: false, disadvantage: false } }],
    ...overrides
  });

  describe('register', () => {
    it('should hook dnd5e.preRollAttackV2 once', () => {
      GrantsEnforcer.register();
      GrantsEnforcer.register();

      expect(Hooks.on).toHaveBeenCalledTimes(1);
      expect(Hooks.on).toHaveBeenCalledWith('dnd5e.preRollAttackV2', expect.any(Function));
    });

    it('should unregister the hook', () => {
      GrantsEnforcer.register();
      GrantsEnforcer.unregister();

      expect(Hooks.off).toHaveBeenCalledWith('dnd5e.preRollAttackV2', 1);
    });

    it('should never cancel the roll from the hook', () => {
      GrantsEnforcer.register();
      setTargets(grantingToken('advantage', 'all', 1));
      const [, listener] = (Hooks.on as jest.Mock).mock.calls[0] as any[];

      expect(listener(attackConfig())).toBeUndefined();
    });
  });

  describe('onPreRollAttack', () => {
    it('should inject advantage when a target grants advantage on all attacks', () => {
      setTargets(grantingToken('advantage', 'all', 1));
      const config = attackConfig();

      GrantsEnforcer.onPreRollAttack(config);

      expect(config.rolls[0].options.advantage).toBe(true);
      expect(config.rolls[0].options.disadvantage).toBe(false);
    });

    it('should inject disadvantage when a target grants disadvantage on all attacks', () => {
      setTargets(grantingToken('disadvantage', 'all', 1));
      const config = attackConfig();

      GrantsEnforcer.onPreRollAttack(config);

      expect(config.rolls[0].options.disadvantage).toBe(true);
      expect(config.rolls[0].options.advantage).toBe(false);
    });

    it('should inject per action type when the attack matches', () => {
      setTargets(grantingToken('advantage', 'rwak', 1));
      const config = attackConfig({ subject: { actionType: 'rwak' } });

      GrantsEnforcer.onPreRollAttack(config);

      expect(config.rolls[0].options.advantage).toBe(true);
    });

    it('should not inject per action type when the attack does not match', () => {
      setTargets(grantingToken('advantage', 'rwak', 1));
      const config = attackConfig({ subject: { actionType: 'mwak' } });

      GrantsEnforcer.onPreRollAttack(config);

      expect(config.rolls[0].options.advantage).toBe(false);
    });

    it('should prefer getActionType(attackMode) on dnd5e 6 activities', () => {
      setTargets(grantingToken('disadvantage', 'rwak', 1));
      const getActionType = jest.fn((mode: string) => (mode === 'thrown' ? 'rwak' : 'mwak'));
      const config = attackConfig({
        subject: { getActionType, actionType: 'mwak' },
        rolls: [{ options: { attackMode: 'thrown' } }]
      });

      GrantsEnforcer.onPreRollAttack(config);

      expect(getActionType).toHaveBeenCalledWith('thrown');
      expect(config.rolls[0].options.disadvantage).toBe(true);
    });

    it('should fall back to the item helper when the activity has no action type', () => {
      setTargets(grantingToken('advantage', 'msak', 1));
      const config = attackConfig({
        subject: {
          item: {
            type: 'spell',
            system: {
              activities: { a1: { attack: { type: { value: 'melee', classification: 'spell' } } } }
            }
          }
        }
      });

      GrantsEnforcer.onPreRollAttack(config);

      expect(config.rolls[0].options.advantage).toBe(true);
    });

    it('should set both when targets grant both (dnd5e resolves to normal)', () => {
      setTargets(grantingToken('advantage', 'all', 1), grantingToken('disadvantage', 'all', 1));
      const config = attackConfig();

      GrantsEnforcer.onPreRollAttack(config);

      expect(config.rolls[0].options.advantage).toBe(true);
      expect(config.rolls[0].options.disadvantage).toBe(true);
    });

    it('should leave the config untouched when there are no targets', () => {
      setTargets();
      const config = attackConfig();

      GrantsEnforcer.onPreRollAttack(config);

      expect(config.rolls[0].options).toEqual({ advantage: false, disadvantage: false });
    });

    it('should leave the config untouched when targets grant nothing', () => {
      setTargets(createMockToken());
      const config = attackConfig();

      GrantsEnforcer.onPreRollAttack(config);

      expect(config.rolls[0].options).toEqual({ advantage: false, disadvantage: false });
    });

    it('should not clear advantage the roller already has', () => {
      setTargets(createMockToken());
      const config = attackConfig({ rolls: [{ options: { advantage: true } }] });

      GrantsEnforcer.onPreRollAttack(config);

      expect(config.rolls[0].options.advantage).toBe(true);
    });

    it('should tolerate empty rolls and missing config', () => {
      setTargets(grantingToken('advantage', 'all', 1));

      expect(() => GrantsEnforcer.onPreRollAttack({ rolls: [] })).not.toThrow();
      expect(() => GrantsEnforcer.onPreRollAttack({})).not.toThrow();
      expect(() => GrantsEnforcer.onPreRollAttack(undefined)).not.toThrow();
    });

    it('should create roll options when they are missing', () => {
      setTargets(grantingToken('advantage', 'all', 1));
      const config = { rolls: [{}] } as any;

      GrantsEnforcer.onPreRollAttack(config);

      expect(config.rolls[0].options.advantage).toBe(true);
    });

    it('should skip targets without an actor', () => {
      setTargets({ id: 't', actor: null }, grantingToken('advantage', 'all', 1));
      const config = attackConfig();

      GrantsEnforcer.onPreRollAttack(config);

      expect(config.rolls[0].options.advantage).toBe(true);
    });
  });

  describe('targetsGrant flag coercion', () => {
    it.each([
      [true, true],
      [1, true],
      ['1', true],
      ['true', true],
      [' 2 ', true],
      [false, false],
      [0, false],
      ['0', false],
      ['false', false],
      ['FALSE', false],
      ['', false],
      [null, false],
      [undefined, false],
      [{}, false]
    ])('should treat %p as %p', (value, expected) => {
      const targets = [grantingToken('advantage', 'all', value)];

      expect(GrantsEnforcer.targetsGrant(targets, 'advantage')).toBe(expected);
    });

    it('should return false for no targets', () => {
      expect(GrantsEnforcer.targetsGrant(null, 'advantage')).toBe(false);
      expect(GrantsEnforcer.targetsGrant(new Set(), 'advantage')).toBe(false);
    });

    it('should not read the other type', () => {
      const targets = [grantingToken('disadvantage', 'all', 1)];

      expect(GrantsEnforcer.targetsGrant(targets, 'advantage')).toBe(false);
      expect(GrantsEnforcer.targetsGrant(targets, 'disadvantage')).toBe(true);
    });

    it('should never read midi-qol flags', () => {
      const token = createMockToken();
      (token.actor as any).flags = {
        'midi-qol': { grants: { advantage: { attack: { all: 1 } } } }
      };

      expect(GrantsEnforcer.targetsGrant([token], 'advantage')).toBe(false);
    });
  });
});
