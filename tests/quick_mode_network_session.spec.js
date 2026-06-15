import { test, expect } from 'playwright/test';
import { NetworkSessionController } from '../network/NetworkSessionController.js';
import { createNetworkMessageRouter } from '../network/NetworkMessageRouter.js';
import { QUICK_MODE_LOADOUTS, createQuickModePlayers } from '../engine/QuickModePreset.js';
import { normalizePlayerConfig } from '../engine/RoleData.js';

test('host BATTLE_START includes quick submode and generated quick players', () => {
  const sent = [];
  const started = [];
  const players = createQuickModePlayers({ player1Class: '法师', player2Class: '战士' });
  const configSession = {
    getP2PSubMode: () => 'quick',
    getConfigPlayers: () => ({
      player1: { ...players[0], locked: true },
      player2: { ...players[1], locked: true },
    }),
    getBattlePlayerConfigs: () => players,
  };
  const controller = new NetworkSessionController({
    configSession,
    routeController: { is: (route) => route === 'config' },
    callbacks: {
      startBattleFromConfigs: (seed, configs) => started.push({ seed, configs }),
    },
  });
  controller._networkManager = {
    myPlayerId: 'player1',
    sendMessage: (payload) => sent.push(payload),
  };

  controller.maybeStartP2PBattle();

  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    type: 'BATTLE_START',
    p2pSubMode: 'quick',
  });
  expect(sent[0].players[0].loadoutSkillIds).toEqual(QUICK_MODE_LOADOUTS['法师']);
  expect(sent[0].players[1].loadoutSkillIds).toEqual(QUICK_MODE_LOADOUTS['战士']);
  expect(sent[0].players[0].roleLoadoutSkillIds).toEqual([]);
  expect(sent[0].players[1].roleLoadoutSkillIds).toEqual([]);
  expect(started[0].configs).toEqual(players);
});

test('received quick BATTLE_START preserves null roles and empty role loadouts', () => {
  const players = createQuickModePlayers({ player1Class: '法师', player2Class: '战士' });
  const started = [];
  const applied = [];
  const configSession = {
    setP2PSubMode: () => {},
    applyRemoteConfig: (cfg) => applied.push(cfg),
    normalizeForPlayer: (cfg, playerId) => normalizePlayerConfig(cfg, playerId),
  };
  const router = createNetworkMessageRouter({
    networkSession: { getMyPlayerId: () => 'player2', maybeStartP2PBattle: () => {} },
    configSession,
    getChatController: () => null,
    battleSession: { battleActive: false },
    getCurrentRoute: () => 'config',
    startBattleFromConfigs: (seed, configs) => started.push({ seed, configs }),
    renderConfigScreen: () => {},
  });

  router({ type: 'BATTLE_START', seed: 123, p2pSubMode: 'quick', players });

  expect(applied).toEqual(players);
  expect(started[0].configs[0]).toMatchObject({
    roleId: null,
    loadoutSkillIds: QUICK_MODE_LOADOUTS['法师'],
    roleLoadoutSkillIds: [],
    quickMode: true,
  });
  expect(started[0].configs[1]).toMatchObject({
    roleId: null,
    loadoutSkillIds: QUICK_MODE_LOADOUTS['战士'],
    roleLoadoutSkillIds: [],
    quickMode: true,
  });
});
