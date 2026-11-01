// Volatile, same-tab memory only. No content or handles in browser storage.
let current = null;

export function clearAiConversation() {
  const previous = current;
  current = null;
  previous?.controller.destroy();
}

export function getAiConversation(owner, authSession, factory) {
  if (!owner || !authSession) throw new Error('Authenticated conversation required');
  if (current?.owner !== owner || current?.authSession !== authSession) {
    clearAiConversation();
    current = { owner, authSession, controller: factory() };
  }
  return current.controller;
}
