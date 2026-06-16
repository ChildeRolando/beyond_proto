import assert from 'node:assert/strict';
import { finalizeResolutionForDisplay } from '../engine/resolution/ResolutionFinalizer.js';

const resolution = {
  schemaVersion: 2,
  turnNumber: 7,
  phases: [
    {
      id: 'turn-7-speed-2',
      phaseKind: 'speed',
      speed: 2,
      events: [
        {
          eventType: 'action_declared',
          actionId: 'action-gather',
          actorId: 'test_mage',
          actorName: '测试法师',
          actorOwnerId: 'player1',
          actorClass: '法师',
          actorRoleId: null,
          skillId: 'mage_gather',
          skillName: '凝气',
        },
        {
          eventType: 'status_applied',
          actionId: 'action-gather',
          targetId: 'test_mage',
          statusId: 'SHIELD_ACTIVE',
        },
      ],
    },
    {
      id: 'turn-7-end',
      phaseKind: 'end_of_turn',
      speed: null,
      events: [
        {
          eventType: 'resource_changed',
          actionId: 'action-gather',
          targetId: 'test_mage',
          resource: 'qi',
          delta: 1,
        },
      ],
    },
    {
      id: 'turn-7-speed-1',
      phaseKind: 'speed',
      speed: 1,
      events: [
        {
          eventType: 'action_declared',
          actionId: 'action-miss',
          actorId: 'enemy_mage',
          actorName: '敌方法师',
          actorOwnerId: 'player2',
          actorClass: '法师',
          actorRoleId: null,
          skillId: 'mage_blast',
          skillName: '气弹',
        },
        {
          eventType: 'action_failed',
          actionId: 'action-miss',
          reason: 'miss',
        },
      ],
    },
  ],
};

const finalSnapshot = {
  registry: {
    entities: [
      {
        id: 'test_mage',
        type: 'CHARACTER',
        name: '测试法师',
        class: '法师',
        ownerId: 'player1',
        roleId: null,
      },
      {
        id: 'enemy_mage',
        type: 'CHARACTER',
        name: '敌方法师',
        class: '法师',
        ownerId: 'player2',
        roleId: null,
      },
    ],
  },
};

const finalized = finalizeResolutionForDisplay(resolution, finalSnapshot);
const eotPhase = finalized.phases.find(phase => phase.phaseKind === 'end_of_turn');
const gatherAction = eotPhase.actions.find(action => action.actionId === 'action-gather');

assert.equal(gatherAction.skillId, 'mage_gather');
assert.equal(gatherAction.actorId, 'test_mage');
assert.match(gatherAction.summaryText, /气 \+1|获得.*气/);

const eotResource = eotPhase.events.find(event => event.eventType === 'resource_changed');
assert.equal(eotResource.skillId, 'mage_gather');
assert.equal(eotResource.actorId, 'test_mage');
assert.equal(eotResource.eventType, 'resource_changed');

const missPhase = finalized.phases.find(phase => phase.speed === 1);
const missAction = missPhase.actions.find(action => action.actionId === 'action-miss');
assert.equal(missAction.skillId, 'mage_blast');
assert.equal(missAction.actorId, 'enemy_mage');
assert.equal(missAction.result, 'miss');
assert.match(missAction.summaryText, /挥空/);

console.log('resolution_finalizer_action_metadata: passed');
