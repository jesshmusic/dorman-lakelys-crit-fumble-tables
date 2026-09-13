/**
 * GmSocket Service Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { resetMocks, createMockActor } from '../mocks/foundry';

const CHANNEL = 'module.dorman-lakelys-crit-fumble-tables';

describe('GmSocket', () => {
  let GmSocket: typeof import('../../src/services/GmSocket').GmSocket;

  beforeEach(async () => {
    resetMocks();
    ({ GmSocket } = await import('../../src/services/GmSocket'));
  });

  afterEach(() => {
    GmSocket.unregister();
    jest.useRealTimers();
  });

  /** Resolve `fromUuid` to this actor for the given uuid. */
  const installActor = (actor: any) => {
    ((globalThis as any).fromUuid as jest.Mock).mockImplementation(async (uuid: string) =>
      uuid === actor.uuid ? actor : null
    );
  };

  const asPlayer = () => {
    (game.user as any).isGM = false;
    (game.user as any).id = 'player1';
  };

  describe('register', () => {
    it('should subscribe to the module channel once', () => {
      GmSocket.register();
      GmSocket.register();

      expect((game as any).socket.on).toHaveBeenCalledTimes(1);
      expect((game as any).socket.on).toHaveBeenCalledWith(CHANNEL, expect.any(Function));
    });

    it('should route socket messages through handleMessage', async () => {
      const handle = jest.spyOn(GmSocket, 'handleMessage').mockResolvedValue(undefined);
      GmSocket.register();

      const [, listener] = ((game as any).socket.on as jest.Mock).mock.calls[0] as any[];
      listener({ type: 'response', id: 'x', ok: true, userId: 'p' });

      expect(handle).toHaveBeenCalledWith({ type: 'response', id: 'x', ok: true, userId: 'p' });
    });
  });

  describe('executeAsGM as a GM', () => {
    it('should execute createEffects locally without touching the socket', async () => {
      const actor = createMockActor();
      installActor(actor);
      const effects = [{ name: 'Dazed' }];

      await GmSocket.executeAsGM('createEffects', { actorUuid: actor.uuid, effects });

      expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith('ActiveEffect', effects);
      expect((game as any).socket.emit).not.toHaveBeenCalled();
    });

    it('should pass non-empty options through to createEmbeddedDocuments', async () => {
      const actor = createMockActor();
      installActor(actor);

      await GmSocket.executeAsGM('createEffects', {
        actorUuid: actor.uuid,
        effects: [{ name: 'X' }],
        options: { keepId: true }
      });

      expect(actor.createEmbeddedDocuments as jest.Mock).toHaveBeenCalledWith(
        'ActiveEffect',
        [{ name: 'X' }],
        { keepId: true }
      );
    });

    it('should execute toggleStatusEffect locally', async () => {
      const actor = createMockActor();
      installActor(actor);

      await GmSocket.executeAsGM('toggleStatusEffect', {
        actorUuid: actor.uuid,
        statusId: 'prone',
        options: { active: true }
      });

      expect(actor.toggleStatusEffect).toHaveBeenCalledWith('prone', { active: true });
      expect((game as any).socket.emit).not.toHaveBeenCalled();
    });

    it('should reject when the actor cannot be resolved', async () => {
      await expect(
        GmSocket.executeAsGM('createEffects', { actorUuid: 'Actor.missing', effects: [] })
      ).rejects.toThrow('Actor.missing');
    });
  });

  describe('executeAsGM as a player', () => {
    beforeEach(asPlayer);

    it('should emit a request and resolve when the GM answers ok', async () => {
      const pending = GmSocket.executeAsGM('createEffects', {
        actorUuid: 'Actor.npc',
        effects: [{ name: 'Dazed' }]
      });

      expect((game as any).socket.emit).toHaveBeenCalledTimes(1);
      const [channel, request] = ((game as any).socket.emit as jest.Mock).mock.calls[0] as any[];
      expect(channel).toBe(CHANNEL);
      expect(request).toEqual({
        type: 'request',
        id: expect.any(String),
        action: 'createEffects',
        payload: { actorUuid: 'Actor.npc', effects: [{ name: 'Dazed' }] },
        userId: 'player1'
      });

      await GmSocket.handleMessage({
        type: 'response',
        id: request.id,
        ok: true,
        userId: 'player1'
      });

      await expect(pending).resolves.toBeUndefined();
    });

    it('should reject when the GM reports a failure', async () => {
      const pending = GmSocket.executeAsGM('toggleStatusEffect', {
        actorUuid: 'Actor.npc',
        statusId: 'prone'
      });
      const [, request] = ((game as any).socket.emit as jest.Mock).mock.calls[0] as any[];

      await GmSocket.handleMessage({
        type: 'response',
        id: request.id,
        ok: false,
        error: 'boom',
        userId: 'player1'
      });

      await expect(pending).rejects.toThrow('boom');
    });

    it('should reject after the timeout when no response arrives', async () => {
      jest.useFakeTimers();

      const pending = GmSocket.executeAsGM('createEffects', {
        actorUuid: 'Actor.npc',
        effects: []
      });
      const assertion = expect(pending).rejects.toThrow(/did not answer/);

      jest.advanceTimersByTime(GmSocket.TIMEOUT_MS + 1);

      await assertion;
    });

    it('should ignore responses for unknown request ids', async () => {
      await expect(
        GmSocket.handleMessage({ type: 'response', id: 'nope', ok: true, userId: 'player1' })
      ).resolves.toBeUndefined();
    });

    it('should warn and resolve without emitting when no GM is connected', async () => {
      (game as any).users.activeGM = null;
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(
        GmSocket.executeAsGM('createEffects', { actorUuid: 'Actor.npc', effects: [] })
      ).resolves.toBeUndefined();

      expect((game as any).socket.emit).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('no GM is connected'));
      expect((ui.notifications as any).warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('request handling', () => {
    // This client IS the active GM unless a test says otherwise.
    beforeEach(() => {
      (game.user as any).id = 'gm1';
    });

    const request = (overrides: any = {}) => ({
      type: 'request' as const,
      id: 'req1',
      action: 'createEffects' as const,
      payload: { actorUuid: 'Actor.npc', effects: [{ name: 'Dazed' }] },
      userId: 'player1',
      ...overrides
    });

    it('should execute createEffects on the active GM and answer ok', async () => {
      const actor = createMockActor({ uuid: 'Actor.npc' } as any);
      installActor(actor);

      await GmSocket.handleMessage(request());

      expect((globalThis as any).fromUuid).toHaveBeenCalledWith('Actor.npc');
      expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith('ActiveEffect', [
        { name: 'Dazed' }
      ]);
      expect((game as any).socket.emit).toHaveBeenCalledWith(CHANNEL, {
        type: 'response',
        id: 'req1',
        ok: true,
        error: undefined,
        userId: 'player1'
      });
    });

    it('should execute toggleStatusEffect on the active GM', async () => {
      const actor = createMockActor({ uuid: 'Actor.npc' } as any);
      installActor(actor);

      await GmSocket.handleMessage(
        request({
          action: 'toggleStatusEffect',
          payload: { actorUuid: 'Actor.npc', statusId: 'prone', options: { active: true } }
        })
      );

      expect(actor.toggleStatusEffect).toHaveBeenCalledWith('prone', { active: true });
      expect((game as any).socket.emit).toHaveBeenCalledWith(
        CHANNEL,
        expect.objectContaining({ type: 'response', id: 'req1', ok: true })
      );
    });

    it('should answer with an error when execution fails', async () => {
      const actor = createMockActor({ uuid: 'Actor.npc' } as any);
      (actor.createEmbeddedDocuments as jest.Mock<any>).mockRejectedValue(new Error('denied'));
      installActor(actor);
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});

      await GmSocket.handleMessage(request());

      expect((game as any).socket.emit).toHaveBeenCalledWith(CHANNEL, {
        type: 'response',
        id: 'req1',
        ok: false,
        error: 'denied',
        userId: 'player1'
      });
      error.mockRestore();
    });

    it('should ignore requests on a GM client that is not the active GM', async () => {
      (game.user as any).id = 'gm2';
      const actor = createMockActor({ uuid: 'Actor.npc' } as any);
      installActor(actor);

      await GmSocket.handleMessage(request());

      expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
      expect((game as any).socket.emit).not.toHaveBeenCalled();
    });

    it('should ignore requests on a player client', async () => {
      asPlayer();
      const actor = createMockActor({ uuid: 'Actor.npc' } as any);
      installActor(actor);

      await GmSocket.handleMessage(request());

      expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
      expect((game as any).socket.emit).not.toHaveBeenCalled();
    });

    it('should ignore malformed messages', async () => {
      await expect(GmSocket.handleMessage(null as any)).resolves.toBeUndefined();
      await expect(GmSocket.handleMessage({ type: 'bogus' } as any)).resolves.toBeUndefined();
      expect((game as any).socket.emit).not.toHaveBeenCalled();
    });
  });
});
