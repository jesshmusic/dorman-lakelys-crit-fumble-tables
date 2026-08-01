/**
 * WildMagicRoller Service Tests
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { resetMocks } from '../mocks/foundry';

describe('WildMagicRoller', () => {
  /** Point the wildMagicTable setting somewhere. */
  const setTable = (ref: string | undefined): void => {
    (game.settings.get as jest.Mock).mockImplementation((_m: string, key: string) =>
      key === 'wildMagicTable' ? ref : undefined
    );
  };

  /** A RollTable-alike whose roll() yields one result. */
  const fakeTable = (text: string, total = 42, name = 'Wild Magic Surge'): any => ({
    name,
    roll: jest
      .fn<() => Promise<any>>()
      .mockResolvedValue({ roll: { total }, results: [{ description: text }] })
  });

  beforeEach(() => {
    resetMocks();
    setTable('Wild Magic Surge');
    (globalThis as any).fromUuid = jest.fn<() => Promise<any>>().mockResolvedValue(null);
    (game as any).tables = { getName: jest.fn().mockReturnValue(undefined) };
    (game as any).packs = { filter: jest.fn().mockReturnValue([]) };
  });

  it('should return null when no table is configured', async () => {
    setTable('');
    const { WildMagicRoller } = await import('../../src/services/WildMagicRoller');

    expect(await WildMagicRoller.roll()).toBeNull();
  });

  it('should return null rather than throw when the table cannot be found', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { WildMagicRoller } = await import('../../src/services/WildMagicRoller');

    // A missing premium compendium must degrade to "no surge", never an error.
    expect(await WildMagicRoller.roll()).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not found'));
    warn.mockRestore();
  });

  it('should resolve a table by UUID', async () => {
    const table = fakeTable('Your hair falls out.');
    (globalThis as any).fromUuid = jest.fn<() => Promise<any>>().mockResolvedValue(table);
    setTable('Compendium.dnd-players-handbook.tables.RollTable.phbWildMagicSurg');
    const { WildMagicRoller } = await import('../../src/services/WildMagicRoller');

    const surge = await WildMagicRoller.roll();

    expect(surge).toEqual({
      text: 'Your hair falls out.',
      tableName: 'Wild Magic Surge',
      roll: 42
    });
  });

  it('should prefer a world table over compendiums when given a name', async () => {
    const world = fakeTable('World surge', 7, 'Homebrew Surges');
    (game as any).tables = { getName: jest.fn().mockReturnValue(world) };
    setTable('Homebrew Surges');
    const { WildMagicRoller } = await import('../../src/services/WildMagicRoller');

    const surge = await WildMagicRoller.roll();

    expect(surge?.text).toBe('World surge');
    expect(surge?.tableName).toBe('Homebrew Surges');
  });

  it('should fall back to searching compendiums by name', async () => {
    const table = fakeTable('Compendium surge', 13);
    (game as any).packs = {
      filter: jest.fn().mockReturnValue([
        {
          documentName: 'RollTable',
          getIndex: jest
            .fn<() => Promise<any>>()
            .mockResolvedValue([{ _id: 'abc', name: 'Wild Magic Surge' }]),
          getDocument: jest.fn<() => Promise<any>>().mockResolvedValue(table)
        }
      ])
    };
    const { WildMagicRoller } = await import('../../src/services/WildMagicRoller');

    expect((await WildMagicRoller.roll())?.text).toBe('Compendium surge');
  });

  it('should draw with roll(), not draw(), so the table posts no card of its own', async () => {
    const table = fakeTable('Silent surge');
    (table as any).draw = jest.fn();
    (game as any).tables = { getName: jest.fn().mockReturnValue(table) };
    const { WildMagicRoller } = await import('../../src/services/WildMagicRoller');

    await WildMagicRoller.roll();

    expect(table.roll).toHaveBeenCalled();
    expect((table as any).draw).not.toHaveBeenCalled();
  });

  it('should read legacy TableResult#text when description is absent', async () => {
    const table: any = {
      name: 'Legacy',
      roll: jest
        .fn<() => Promise<any>>()
        .mockResolvedValue({ roll: { total: 1 }, results: [{ text: 'Legacy text' }] })
    };
    (game as any).tables = { getName: jest.fn().mockReturnValue(table) };
    const { WildMagicRoller } = await import('../../src/services/WildMagicRoller');

    expect((await WildMagicRoller.roll())?.text).toBe('Legacy text');
  });

  it('should return null when the table yields no text', async () => {
    const table: any = {
      name: 'Empty',
      roll: jest.fn<() => Promise<any>>().mockResolvedValue({ roll: { total: 1 }, results: [{}] })
    };
    (game as any).tables = { getName: jest.fn().mockReturnValue(table) };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { WildMagicRoller } = await import('../../src/services/WildMagicRoller');

    expect(await WildMagicRoller.roll()).toBeNull();
    warn.mockRestore();
  });

  it('should return null when the draw throws', async () => {
    const table: any = {
      name: 'Broken',
      roll: jest.fn<() => Promise<any>>().mockRejectedValue(new Error('boom'))
    };
    (game as any).tables = { getName: jest.fn().mockReturnValue(table) };
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { WildMagicRoller } = await import('../../src/services/WildMagicRoller');

    expect(await WildMagicRoller.roll()).toBeNull();
    err.mockRestore();
  });
});
