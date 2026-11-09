// 테스트용 가짜 소켓 쌍: 서버 쪽(RoomManager.attach 에 전달) ↔ 클라이언트 쪽(봇이 사용). 네트워크 없이 같은 프로세스에서 동작.
export function makePair(id) {
  const listeners = {};
  const server = {
    id, handlers: {},
    on(ev, fn) { this.handlers[ev] = fn; },
    emit(ev, data) { (listeners[ev] || []).forEach((fn) => fn(data)); },
    disconnect() { client.close(); },
  };
  server.volatile = { emit: (ev, data) => server.emit(ev, data) };
  const client = {
    id,
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    emit(ev, data, cb) { const h = server.handlers[ev]; if (h) h(data, cb); },
    close() { const h = server.handlers.disconnect; if (h) h('client close'); },
  };
  return { server, client };
}
