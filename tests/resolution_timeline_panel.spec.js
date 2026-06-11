// Unit tests for ResolutionTimelinePanel
// Run: node tests/resolution_timeline_panel.spec.js
//
// Milestone o4.2

import { createResolutionTimelinePanel } from '../ui/battle/ResolutionTimelinePanel.js';
import * as fs from 'fs';
import * as path from 'path';

let pass = 0, fail = 0;

function assert(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error(`  FAIL: ${label}`); }
}

function assertEquals(actual, expected, label) {
  if (actual === expected) { pass++; }
  else { fail++; console.error(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

// ═══════════════════════════════════════════
// Fake DOM element factory
// ═══════════════════════════════════════════

function createFakeEl(overrides = {}) {
  const el = {
    tagName: overrides.tagName || 'div',
    id: overrides.id || '',
    className: overrides.className || '',
    classList: {
      _list: (overrides.className || '').split(' ').filter(Boolean),
      add(...names) { for (const n of names) { if (!this._list.includes(n)) this._list.push(n); } },
      remove(...names) { this._list = this._list.filter(n => !names.includes(n)); },
      toggle(name, force) {
        if (arguments.length === 2) {
          if (force) { if (!this._list.includes(name)) this._list.push(name); }
          else { this._list = this._list.filter(n => n !== name); }
        } else {
          if (this._list.includes(name)) { this._list = this._list.filter(n => n !== name); }
          else { this._list.push(name); }
        }
      },
      contains(name) { return this._list.includes(name); },
    },
    style: { display: '' },
    dataset: {},
    innerHTML: '',
    textContent: '',
    hidden: false,
    _children: [],
    _eventListeners: {},
    _parentNode: null,
    addEventListener(type, fn) {
      if (!this._eventListeners[type]) this._eventListeners[type] = [];
      this._eventListeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (this._eventListeners[type]) {
        this._eventListeners[type] = this._eventListeners[type].filter(f => f !== fn);
      }
    },
    dispatchEvent(event) {
      const listeners = this._eventListeners[event.type] || [];
      for (const fn of listeners) fn(event);
    },
    querySelectorAll(selector) {
      // Class selector
      if (selector === '.resolution-phase') return this._children.filter(c => c._phaseNode);
      if (selector === '.resolution-action-card') {
        const all = [];
        for (const child of this._children) {
          if (child._actionCard) { all.push(child); }
          else if (child._children) {
            for (const c of child._children) { if (c._actionCard) all.push(c); }
          }
        }
        return all;
      }
      // Attribute selector [data-phase-id="X"]
      const attrMatch = selector.match(/\[data-phase-id="([^"]+)"\]/);
      if (attrMatch) {
        const targetId = attrMatch[1];
        return this._children.filter(c => c.dataset?.phaseId === targetId);
      }
      return [];
    },
    querySelector(selector) {
      // Use querySelectorAll for all selectors
      const all = this.querySelectorAll(selector);
      return all[0] || null;
    },
    appendChild(child) {
      child._parentNode = this;
      child.parentNode = this;
      this._children.push(child);
      return child;
    },
    cloneNode() {
      const cloned = createFakeEl({ id: this.id, className: this.className });
      cloned.innerHTML = this.innerHTML;
      cloned.dataset = { ...this.dataset };
      cloned.hidden = this.hidden;
      return cloned;
    },
    parentNode: null,
    replaceChild(newChild, oldChild) {
      const idx = this._children.indexOf(oldChild);
      if (idx >= 0) {
        this._children[idx] = newChild;
        newChild._parentNode = this;
        newChild.parentNode = this;
        oldChild._parentNode = null;
        oldChild.parentNode = null;
      }
    },
  };
  return el;
}

function createElStore() {
  const els = new Map();
  return {
    getEl(id) { return els.get(id) || null; },
    setEl(id, el) { el.id = id; els.set(id, el); },
  };
}

// ═══════════════════════════════════════════
// Helpers: build fixtures
// ═══════════════════════════════════════════

function makeActionSummary(overrides = {}) {
  return {
    actionId: overrides.actionId || 'act-1',
    actorId: overrides.actorId || 'char-1',
    actorName: overrides.actorName || 'Warrior',
    actorOwnerId: overrides.actorOwnerId || 'player1',
    actorRoleId: overrides.actorRoleId || 'warrior_flash',
    skillId: overrides.skillId || 'warrior_slash',
    skillName: overrides.skillName || '斩击',
    summaryText: overrides.summaryText || '造成 100 伤害',
    playerLabel: overrides.playerLabel || '1P',
    ownerId: overrides.ownerId || 'player1',
    effectLines: overrides.effectLines || null,
    effectLineKinds: overrides.effectLineKinds || null,
  };
}

function makePhase(overrides = {}) {
  return {
    id: overrides.id || 'turn-1-speed-3',
    phaseKind: overrides.phaseKind || 'speed',
    speed: overrides.speed ?? 3,
    commandCount: overrides.commandCount ?? 1,
    beforeSnapshot: overrides.beforeSnapshot || null,
    afterSnapshot: overrides.afterSnapshot || null,
    events: overrides.events || [],
    summary: overrides.summary || 'Speed 3: 1 action',
    actionCount: overrides.actionCount ?? 1,
    actions: overrides.actions || [makeActionSummary()],
    viewState: overrides.viewState || { characters: [] },
  };
}

function makeResolution(overrides = {}) {
  return {
    schemaVersion: 2,
    turnNumber: overrides.turnNumber ?? 1,
    initialSnapshot: overrides.initialSnapshot || null,
    finalSnapshot: overrides.finalSnapshot || null,
    phases: overrides.phases || [],
  };
}

function makePlaybackFrame(overrides = {}) {
  return {
    mode: 'playback',
    timeMs: overrides.timeMs ?? 500,
    durationMs: overrides.durationMs ?? 2000,
    phaseId: overrides.phaseId || 'turn-1-speed-3',
    activeActionIds: overrides.activeActionIds || ['act-1'],
    activeClipIds: overrides.activeClipIds || [],
    activeClips: overrides.activeClips || [],
    sceneState: overrides.sceneState || null,
    effects: overrides.effects || [],
  };
}

function setupPanel(overrides = {}) {
  const elStore = createElStore();
  // Create all required DOM elements
  elStore.setEl('resolution-timeline', createFakeEl());
  elStore.setEl('resolution-axis', createFakeEl());
  elStore.setEl('resolution-active-speed', createFakeEl());
  elStore.setEl('resolution-phase-summary', createFakeEl());
  elStore.setEl('resolution-complete', createFakeEl());
  elStore.setEl('resolution-skip', createFakeEl());
  elStore.setEl('resolution-timeline-close', createFakeEl());
  elStore.setEl('resolution-timeline-open', createFakeEl());

  const panel = createResolutionTimelinePanel({
    getEl: overrides.getEl || ((id) => elStore.getEl(id)),
    getCharacterPortraitSrc: overrides.getCharacterPortraitSrc || (() => ''),
    getCurrentGameMode: overrides.getCurrentGameMode || (() => 'local'),
  });

  return { panel, elStore };
}

// ═══════════════════════════════════════════
// Test 1: panel API exists
// ═══════════════════════════════════════════

console.log('\n=== Test 1: panel API exists ===');

{
  const { panel } = setupPanel();

  console.log('\n[1a] all API methods are functions');
  assertEquals(typeof panel.reset, 'function', 'reset is function');
  assertEquals(typeof panel.renderResolution, 'function', 'renderResolution is function');
  assertEquals(typeof panel.updatePlaybackFrame, 'function', 'updatePlaybackFrame is function');
  assertEquals(typeof panel.markComplete, 'function', 'markComplete is function');
  assertEquals(typeof panel.bindSkip, 'function', 'bindSkip is function');
  assertEquals(typeof panel.setCollapsed, 'function', 'setCollapsed is function');
  assertEquals(typeof panel.toggleCollapsed, 'function', 'toggleCollapsed is function');

  console.log('\n[1b] panel does not expose playback control methods');
  const apiKeys = Object.keys(panel);
  assert(!apiKeys.includes('play'), 'no play method');
  assert(!apiKeys.includes('pause'), 'no pause method');
  assert(!apiKeys.includes('resume'), 'no resume method');
  assert(!apiKeys.includes('stop'), 'no stop method');
  assert(!apiKeys.includes('seek'), 'no seek method');
  assert(!apiKeys.includes('skipToEnd'), 'no skipToEnd method');
}

// ═══════════════════════════════════════════
// Test 2: renderResolution renders phases/actions
// ═══════════════════════════════════════════

console.log('\n=== Test 2: renderResolution renders phases/actions ===');

{
  const { panel, elStore } = setupPanel();
  const axis = elStore.getEl('resolution-axis');
  const timeline = elStore.getEl('resolution-timeline');

  const phase1 = makePhase({ id: 'turn-1-speed-3', speed: 3, actions: [makeActionSummary({ actionId: 'act-a', actorName: 'Alpha' })] });
  const phase2 = makePhase({ id: 'turn-1-speed-2', speed: 2, actions: [makeActionSummary({ actionId: 'act-b', actorName: 'Bravo' })] });
  const resolution = makeResolution({ phases: [phase1, phase2] });

  panel.renderResolution(resolution);

  console.log('\n[2a] axis has content');
  assert(axis.innerHTML.length > 0, 'axis innerHTML populated');

  console.log('\n[2b] timeline has show class');
  assert(timeline.classList.contains('show'), 'timeline has show class');

  console.log('\n[2c] phase ids appear in output');
  assert(axis.innerHTML.includes('data-phase-id="turn-1-speed-3"'), 'phase 1 id present');
  assert(axis.innerHTML.includes('data-phase-id="turn-1-speed-2"'), 'phase 2 id present');

  console.log('\n[2d] action ids appear in output');
  assert(axis.innerHTML.includes('data-action-id="act-a"'), 'action a present');
  assert(axis.innerHTML.includes('data-action-id="act-b"'), 'action b present');

  console.log('\n[2e] speed labels appear');
  assert(axis.innerHTML.includes('Speed 3'), 'speed 3 label');
  assert(axis.innerHTML.includes('Speed 2'), 'speed 2 label');

  console.log('\n[2f] actor names appear');
  assert(axis.innerHTML.includes('Alpha'), 'actor Alpha name');
  assert(axis.innerHTML.includes('Bravo'), 'actor Bravo name');

  console.log('\n[2g] end phase rendered');
  assert(axis.innerHTML.includes('End'), 'end phase label');
  assert(axis.innerHTML.includes('resolution-phase-end'), 'end phase testid');
}

// ═══════════════════════════════════════════
// Test 3: empty resolution safe
// ═══════════════════════════════════════════

console.log('\n=== Test 3: empty resolution safe ===');

{
  const { panel } = setupPanel();

  console.log('\n[3a] renderResolution(null) does not throw');
  let threw = false;
  try { panel.renderResolution(null); }
  catch (e) { threw = true; console.error(`    ${e.message}`); }
  assert(!threw, 'null resolution safe');

  console.log('\n[3b] renderResolution({}) does not throw');
  threw = false;
  try { panel.renderResolution({}); }
  catch (e) { threw = true; console.error(`    ${e.message}`); }
  assert(!threw, 'empty resolution safe');

  console.log('\n[3c] renderResolution({ phases: [] }) does not throw');
  threw = false;
  try { panel.renderResolution({ phases: [] }); }
  catch (e) { threw = true; console.error(`    ${e.message}`); }
  assert(!threw, 'empty phases safe');
}

// ═══════════════════════════════════════════
// Test 4: updatePlaybackFrame marks active phase/action
// ═══════════════════════════════════════════

console.log('\n=== Test 4: updatePlaybackFrame marks active phase/action ===');

{
  const { panel, elStore } = setupPanel();
  const timeline = elStore.getEl('resolution-timeline');

  // Set up phase cards directly in timeline._children (bypass renderResolution innerHTML)
  const phaseCard = createFakeEl();
  phaseCard._phaseNode = true;
  phaseCard.dataset.phaseId = 'turn-1-speed-3';
  phaseCard.dataset.speed = '3';
  phaseCard.classList._list = [];

  const actionCard = createFakeEl();
  actionCard._actionCard = true;
  actionCard.dataset.actionId = 'act-1';
  actionCard.classList._list = [];
  phaseCard._children.push(actionCard);
  actionCard._parentNode = phaseCard;

  const phase2 = createFakeEl();
  phase2._phaseNode = true;
  phase2.dataset.phaseId = 'turn-1-speed-2';
  phase2.classList._list = [];

  timeline._children = [phaseCard, phase2];
  phaseCard._parentNode = timeline;
  phase2._parentNode = timeline;

  console.log('\n[4a] updatePlaybackFrame highlights active phase');
  const frame = makePlaybackFrame({ phaseId: 'turn-1-speed-3', activeActionIds: ['act-1'], timeMs: 500 });
  panel.updatePlaybackFrame(frame);
  assert(phaseCard.classList.contains('active'), 'phase card gets active class');

  console.log('\n[4b] activeActionIds highlights action cards');
  assert(actionCard.classList.contains('active'), 'action card gets active class');

  console.log('\n[4c] active speed label updated');
  const activeSpeedEl = elStore.getEl('resolution-active-speed');
  assert(activeSpeedEl.textContent.includes('0.5'), `active speed shows time: ${activeSpeedEl.textContent}`);

  console.log('\n[4d] other phase not active');
  assert(!phase2.classList.contains('active'), 'other phase not active');

  console.log('\n[4e] updatePlaybackFrame with null frame safe');
  let threw = false;
  try { panel.updatePlaybackFrame(null); }
  catch (e) { threw = true; }
  assert(!threw, 'null frame safe');
}

// ═══════════════════════════════════════════
// Test 5: markComplete
// ═══════════════════════════════════════════

console.log('\n=== Test 5: markComplete ===');

{
  const { panel, elStore } = setupPanel();
  const timeline = elStore.getEl('resolution-timeline');
  const completeEl = elStore.getEl('resolution-complete');

  const phase = makePhase({ actions: [makeActionSummary()] });
  panel.renderResolution(makeResolution({ phases: [phase] }));

  console.log('\n[5a] markComplete shows completion text');
  panel.markComplete('回放完成');
  assert(timeline.classList.contains('complete'), 'timeline has complete class');
  assertEquals(completeEl.hidden, false, 'complete el visible');
  assertEquals(completeEl.textContent, '回放完成', 'complete text set');

  console.log('\n[5b] markComplete updates summary');
  const summaryEl = elStore.getEl('resolution-phase-summary');
  assertEquals(summaryEl.textContent, '回放完成', 'summary shows complete text');

  console.log('\n[5c] markComplete with default text');
  panel.markComplete();
  assertEquals(completeEl.textContent, '回放完成', 'default text is 回放完成');
}

// ═══════════════════════════════════════════
// Test 6: bindSkip
// ═══════════════════════════════════════════

console.log('\n=== Test 6: bindSkip ===');

{
  const { panel, elStore } = setupPanel();
  const timeline = elStore.getEl('resolution-timeline');
  const skipBtn = elStore.getEl('resolution-skip');
  skipBtn._parentNode = timeline;
  skipBtn.parentNode = timeline;
  timeline._children.push(skipBtn);

  console.log('\n[6a] bindSkip clones button and attaches click handler');
  let skipCallCount = 0;
  const onSkip = () => { skipCallCount++; };
  panel.bindSkip(onSkip);

  // bindSkip clones skipBtn, replaces in parent, adds event listener
  // The new button should be in timeline._children and have a click listener
  const newBtn = timeline._children.find(c => c.id === 'resolution-skip');
  assert(newBtn != null, 'new button exists in timeline children');
  const hasClickHandler = newBtn?._eventListeners?.click?.length > 0;
  assert(hasClickHandler, 'click listener attached to new button');

  // Also verify the old button is no longer in children
  assert(!timeline._children.includes(skipBtn), 'old button removed from children');

  // Fire the listener directly
  if (hasClickHandler) {
    newBtn._eventListeners.click[0]();
    assertEquals(skipCallCount, 1, 'onSkip called once');
  }
}

// ═══════════════════════════════════════════
// Test 7: collapsed state
// ═══════════════════════════════════════════

console.log('\n=== Test 7: collapsed state ===');

{
  const { panel, elStore } = setupPanel();
  const timeline = elStore.getEl('resolution-timeline');
  const closeBtn = elStore.getEl('resolution-timeline-close');
  const openBtn = elStore.getEl('resolution-timeline-open');

  console.log('\n[7a] setCollapsed(true)');
  panel.setCollapsed(true);
  assertEquals(timeline.dataset.collapsed, '1', 'dataset.collapsed === "1"');
  assertEquals(closeBtn.hidden, true, 'close button hidden');
  assertEquals(openBtn.hidden, false, 'open button visible');

  console.log('\n[7b] setCollapsed(false)');
  panel.setCollapsed(false);
  assertEquals(timeline.dataset.collapsed, '0', 'dataset.collapsed === "0"');
  assertEquals(closeBtn.hidden, false, 'close button visible');
  assertEquals(openBtn.hidden, true, 'open button hidden');

  console.log('\n[7c] toggleCollapsed');
  panel.setCollapsed(false);
  panel.toggleCollapsed();
  assertEquals(timeline.dataset.collapsed, '1', 'toggled from false → true');
  panel.toggleCollapsed();
  assertEquals(timeline.dataset.collapsed, '0', 'toggled from true → false');
}

// ═══════════════════════════════════════════
// Test 8: boundary source scan
// ═══════════════════════════════════════════

console.log('\n=== Test 8: boundary source scan ===');

{
  const panelPath = path.resolve('ui/battle/ResolutionTimelinePanel.js');
  const src = fs.readFileSync(panelPath, 'utf-8');
  const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  const FORBIDDEN = [
    'BattleSessionController',
    'BattleCanvasRenderer',
    'AppRuntime',
    'TurnPlaybackController',
    'TurnPlaybackRuntime',
    'battleSession',
    'GameEngine',
    'renderAll',
    'setResolutionPlaybackState',
    'setResolutionPlaybackLocked',
    'keyframes',
    'animEvents',
  ];

  console.log('\n[8a] no forbidden identifiers in source');
  for (const term of FORBIDDEN) {
    const found = noComments.includes(term);
    if (found) console.error(`    Found "${term}"`);
    assert(!found, `no "${term}" in source`);
  }

  console.log('\n[8b] no playback control imports');
  const importLines = src.split('\n').filter(l => l.trimStart().startsWith('import'));
  for (const line of importLines) {
    const isOK = line.includes('SkillData.js') ||
                 line.includes('GameModes.js') ||
                 line.includes('SkillIconAssets.js');
    assert(isOK, `legal import only: ${line.trim()}`);
  }
}

// ═══════════════════════════════════════════
// Test 9: no playback control methods in source
// ═══════════════════════════════════════════

console.log('\n=== Test 9: no playback control methods ===');

{
  const panelPath = path.resolve('ui/battle/ResolutionTimelinePanel.js');
  const src = fs.readFileSync(panelPath, 'utf-8');
  // Strip comments and strings
  const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  // Check for direct calls to runtime-like methods
  // (excluding onSkip parameter name in bindSkip which is allowed)
  const stripped = noComments
    .replace(/\bonSkip\b/g, '')     // remove the onSkip parameter name
    .replace(/\bbindSkip\b/g, '');  // remove the bindSkip method name

  const FORBIDDEN_CALLS = [
    'seek(',
    '.play(',
    '.pause(',
    '.resume(',
    'skipToEnd(',
  ];

  console.log('\n[9a] no playback control calls (excluding bindSkip)');
  for (const term of FORBIDDEN_CALLS) {
    const found = stripped.includes(term);
    if (found) console.error(`    Found "${term}" in source`);
    assert(!found, `no "${term}" in source`);
  }
}

// ═══════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════

console.log(`\n=== Results: ${pass} pass, ${fail} fail ===`);
if (fail > 0) {
  console.error('SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED');
}
