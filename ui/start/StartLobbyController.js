// StartLobbyController — start screen + P2P lobby + tutorial modal UI.
// All business logic stays in main.js via ctx.callbacks.
// Does NOT import main.js, GameEngine, NetworkManager, or canvas.

// ─── Tutorial modal ───

function showTutorial() {
  document.getElementById('tutorial-overlay').classList.add('show');
}

function hideTutorial() {
  document.getElementById('tutorial-overlay').classList.remove('show');
}

// ─── Room UI helpers ───

function showRoomSetup() {
  document.getElementById('room-setup').style.display = 'flex';
  document.getElementById('p2p-submode-select').style.display = 'flex';
  document.getElementById('room-host-section').style.display = 'none';
  document.getElementById('room-join-section').style.display = 'none';
  document.getElementById('room-code-text').style.display = 'none';
  document.getElementById('room-error').textContent = '';
  document.getElementById('p2p-class-pick').style.display = 'none';
}

function showConnectionChoices() {
  document.getElementById('room-host-section').style.display = 'block';
  document.getElementById('room-join-section').style.display = 'block';
}

function hideRoomSetup() {
  document.getElementById('room-setup').style.display = 'none';
  document.getElementById('p2p-submode-select').style.display = 'none';
  document.getElementById('room-code-text').style.display = 'none';
  document.getElementById('room-error').textContent = '';
}

function showRoomCode(code) {
  document.getElementById('room-code-text').textContent = code;
  document.getElementById('room-code-text').style.display = 'block';
}

function setRoomError(text) {
  document.getElementById('room-error').textContent = text;
}

function updateHostStatus(status, text) {
  const dot = document.querySelector('#room-host-section .dot');
  dot.className = 'dot ' + (status === 'connected' ? 'green' : status === 'connecting' ? 'yellow' : 'red');
  document.getElementById('host-status-text').textContent = text;
}

function updateJoinStatus(status, text) {
  const dot = document.querySelector('#room-join-section .dot');
  dot.className = 'dot ' + (status === 'connected' ? 'green' : status === 'connecting' ? 'yellow' : 'red');
  document.getElementById('join-status-text').textContent = text;
}

function resetConnectionUI(defaultAddr) {
  updateHostStatus('disconnected', '等待创建...');
  updateJoinStatus('disconnected', '输入房间码和地址');
  document.getElementById('room-code-input').value = '';
  document.getElementById('server-addr-input').value = defaultAddr;
  document.getElementById('server-addr-input-host').value = defaultAddr;
}

// ─── Public API ───

export function initStartLobbyController(ctx) {
  let pendingRoomMode = null;

  document.getElementById('btn-local-duel').addEventListener('click', () => {
    ctx.callbacks.onStartLocalDuel();
  });

  document.getElementById('btn-local-coop').addEventListener('click', () => {
    ctx.callbacks.onStartLocalCoop();
  });

  document.getElementById('btn-local-solo').addEventListener('click', () => {
    ctx.callbacks.onStartLocalSolo();
  });

  document.getElementById('btn-tutorial').addEventListener('click', () => {
    ctx.callbacks.onStartTutorial?.();
  });
  document.getElementById('tutorial-close').addEventListener('click', hideTutorial);
  document.getElementById('tutorial-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideTutorial();
  });
  document.getElementById('btn-help-top').addEventListener('click', showTutorial);

  document.getElementById('btn-p2p-duel').addEventListener('click', () => {
    pendingRoomMode = null;
    showRoomSetup();
    resetConnectionUI(ctx.defaultAddr);
    ctx.callbacks.onStartP2PDuel?.();
  });

  document.getElementById('btn-p2p-quick-mode')?.addEventListener('click', () => {
    pendingRoomMode = 'p2p_quick';
    ctx.callbacks.onSelectP2PSubMode?.('quick');
    showConnectionChoices();
    updateHostStatus('disconnected', '准备创建：联机快速');
    updateJoinStatus('disconnected', '准备加入：联机快速');
  });

  document.getElementById('btn-p2p-draft-mode')?.addEventListener('click', () => {
    pendingRoomMode = 'p2p_draft';
    ctx.callbacks.onSelectP2PSubMode?.('draft');
    showConnectionChoices();
    updateHostStatus('disconnected', '准备创建：联机征召');
    updateJoinStatus('disconnected', '准备加入：联机征召');
  });

  document.getElementById('btn-p2p-coop').addEventListener('click', () => {
    ctx.callbacks.onStartP2PCoop?.();
  });

  const legacyPveButton = document.getElementById('btn-pve');
  if (legacyPveButton) {
    legacyPveButton.addEventListener('click', () => {
      ctx.callbacks.onStartLegacyPve?.();
    });
  }

  document.getElementById('btn-back-start').addEventListener('click', () => {
    pendingRoomMode = null;
    ctx.callbacks.onBackStart();
    hideRoomSetup();
    resetConnectionUI(ctx.defaultAddr);
  });

  document.getElementById('btn-create-room').addEventListener('click', async () => {
    setRoomError('');
    document.getElementById('room-code-text').style.display = 'none';
    updateHostStatus('connecting', '连接中...');
    const ui = {
      showRoomCode,
      setRoomError,
      updateHostStatus,
      updateJoinStatus,
      hideRoomSetup,
      resetConnectionUI: () => resetConnectionUI(ctx.defaultAddr),
    };
    const serverAddr = document.getElementById('server-addr-input-host').value.trim() || ctx.defaultAddr;
    ctx.callbacks.onCreateRoom({ serverAddr, ui, roomMode: pendingRoomMode || 'p2p_draft' });
  });

  document.getElementById('btn-join-room').addEventListener('click', async () => {
    const code = document.getElementById('room-code-input').value.toUpperCase().trim();
    if (!code || code.length !== 4) {
      setRoomError('请输入4位房间码');
      return;
    }
    setRoomError('');
    updateJoinStatus('connecting', '连接中...');
    const ui = {
      showRoomCode,
      setRoomError,
      updateHostStatus,
      updateJoinStatus,
      hideRoomSetup,
      resetConnectionUI: () => resetConnectionUI(ctx.defaultAddr),
    };
    const serverAddr = document.getElementById('server-addr-input').value.trim() || ctx.defaultAddr;
    ctx.callbacks.onJoinRoom({ roomCode: code, serverAddr, ui, expectedRoomMode: pendingRoomMode || 'p2p_draft' });
  });

  return {
    hideRoomSetup,
    hideTutorial,
    showTutorial,
    resetTransientUi() {
      pendingRoomMode = null;
      hideTutorial();
      hideRoomSetup();
      resetConnectionUI(ctx.defaultAddr);
    },
    resetConnectionUI: () => resetConnectionUI(ctx.defaultAddr),
  };
}
