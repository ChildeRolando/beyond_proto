// ChatController — owns chat input binding and message DOM rendering.
// Does NOT import GameEngine. Pure DOM + event binding.

/**
 * Initialize chat controller. Binds #chat-input keydown and manages
 * chat message display.
 *
 * @param {Object} ctx
 * @param {Object} ctx.callbacks
 * @param {Function} ctx.callbacks.sendChat - (text) => void (sends CHAT via network)
 * @returns {{ appendMessage: (sender: string, text: string) => void, clear: () => void }}
 */
export function initChatController(ctx) {
  const { callbacks } = ctx;
  const { sendChat } = callbacks;

  // ─── Chat input keydown ───

  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const msg = e.target.value.trim();
        if (!msg) return;
        e.target.value = '';
        appendMessage('我', msg);
        if (sendChat) sendChat(msg);
      }
    });
  }

  // ─── Public API ───

  function appendMessage(sender, text) {
    const msgs = document.getElementById('chat-messages');
    if (!msgs) return;
    const div = document.createElement('div');
    div.style.marginBottom = '2px';
    div.innerHTML = `<b>${sender}:</b> ${text}`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function clear() {
    const msgs = document.getElementById('chat-messages');
    if (msgs) msgs.innerHTML = '';
  }

  return { appendMessage, clear };
}
