// RuntimeDomDefaults — default server address filling on DOMContentLoaded.

export function installRuntimeDomDefaults({ getEl, getDefaultAddr }) {
  document.addEventListener('DOMContentLoaded', () => {
    const defaultAddr = getDefaultAddr();
    const hostInput = getEl('server-addr-input-host');
    const joinInput = getEl('server-addr-input');
    if (hostInput) hostInput.value = defaultAddr;
    if (joinInput) joinInput.value = defaultAddr;
  });
}
