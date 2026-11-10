// 가상 클라이언트(봇) 테스트:  방 생성 → 입장 → 시작 → 입력 전송 → 상태 수신 → 일시정지/재접속 → 도착까지
//   node tools/bot-test.js                      서버를 직접 띄우고(포트 자동) socket.io-client 로 실제 네트워크 테스트
//   node tools/bot-test.js http://localhost:3000   이미 떠 있는 서버(예: Render 배포본) 테스트
//   node tools/bot-test.js --inproc             네트워크 없이 같은 프로세스에서 가짜 소켓으로 테스트(빠름)
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const INPROC = args.includes('--inproc');
const urlArg = args.find((a) => a.startsWith('http'));

let pass = 0, fail = 0;
const check = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg); } };
const section = (t) => console.log(`\n▶ ${t}`);

// 봇: 이벤트를 모아 두는 클라이언트 래퍼
function makeBot(raw, name) {
  const bot = { raw, name, snaps: [], evts: [], lobby: null, init: null, pause: null, resume: 0, abort: null, end: null, token: null, code: null };
  raw.on('snap', (s) => { bot.snaps.push(s); if (bot.snaps.length > 400) bot.snaps.shift(); });
  raw.on('evt', (e) => bot.evts.push(...e));
  raw.on('room:state', (s) => { bot.lobby = s; });
  raw.on('game:init', (d) => { bot.init = d; });
  raw.on('game:pause', (d) => { bot.pause = d; });
  raw.on('game:resume', () => { bot.resume++; bot.pause = null; });
  raw.on('game:abort', (d) => { bot.abort = d; });
  raw.on('game:end', (d) => { bot.end = d; });
  bot.call = (ev, data) => new Promise((res) => raw.emit(ev, data, res));
  bot.last = () => bot.snaps[bot.snaps.length - 1];
  return bot;
}

async function scenario(connect, advance) {
  const A = makeBot(await connect(), 'Alpha'), B = makeBot(await connect(), 'Bravo'), C = makeBot(await connect(), 'Charlie'), D = makeBot(await connect(), 'Delta');

  section('1) 방 만들기 / 코드로 입장');
  let r = await A.call('room:create', { name: 'Alpha' });
  check(r.ok && /^[A-Z]{4}$/.test(r.code), `방 생성 성공, 4글자 코드 ${r.code}`);
  A.code = r.code; A.token = r.token;
  r = await B.call('room:join', { code: A.code.toLowerCase(), name: 'Bravo' }); B.token = r.token;
  check(r.ok, '소문자 코드로도 입장');
  r = await D.call('room:join', { code: 'ZZZZ', name: 'x' });
  check(!r.ok, '없는 코드는 입장 실패');
  await advance(50);
  check(A.lobby && A.lobby.players.length === 2 && A.lobby.layout.length === 2, '로비: 2명 → 왼쪽/오른쪽 자리 배정 표시');

  section('2) 3명은 시작 불가');
  r = await C.call('room:join', { code: A.code, name: 'Charlie' }); C.token = r.token;
  await advance(50);
  check(A.lobby.n === 3 && !A.lobby.canStart && /3명은 플레이할 수 없습니다/.test(A.lobby.warn), `3명: 안내 "${A.lobby.warn}"`);
  B.raw.emit('room:ready', { ready: true }); C.raw.emit('room:ready', { ready: true });
  r = await A.call('room:start');
  check(!r.ok, '3명일 때 시작 요청은 거절됨: ' + r.err);
  r = await B.call('room:start');
  check(!r.ok, '방장이 아니면 시작 불가: ' + r.err);

  section('3) 4명: 준비 → 시작 → 키 배분');
  r = await D.call('room:join', { code: A.code, name: 'Delta' }); D.token = r.token;
  r = await A.call('room:start');
  check(!r.ok, '모두 준비하기 전에는 시작 불가: ' + r.err);
  D.raw.emit('room:ready', { ready: true });
  await advance(50);
  check(A.lobby.canStart, '4명 모두 준비 → 시작 가능');
  r = await A.call('room:start');
  check(r.ok, '방장이 시작');
  await advance(100);
  const bots = [A, B, C, D];
  check(bots.every((b) => b.init && b.init.n === 4), '모든 플레이어가 game:init 수신');
  check(JSON.stringify(A.init.assign) === JSON.stringify([17 | 256, 34 | 256, 68 | 256, 136 | 256]), `4명 키 배분 = q+e, w+r, a+d, s+f (+ 모두 스페이스 브레이크)`);
  check(new Set(bots.map((b) => b.init.slot)).size === 4, '슬롯이 서로 다름');

  section('4) 카운트다운 / 상태 수신 / 허용되지 않은 키 무시');
  await advance(500);
  check(bots.every((b) => b.snaps.length > 5), '카운트다운 중에도 상태(snap) 수신');
  check(A.last().cd >= 1, `카운트다운 표시 중 (cd=${A.last().cd})`);
  await advance(3400);
  check(A.last().ph === 1, '카운트다운 후 주행 단계(ph=1)');
  A.raw.emit('input', 0xff);          // A는 q,e만 허용 → 나머지는 무시되어야 함
  B.raw.emit('input', 0x01);          // B(w,r 담당)가 q를 보냄 → 무시
  await advance(200);
  check(A.last().k[0] === 0x11, `A가 8키를 보내도 담당(q,e)만 반영됨 (k0=${A.last().k[0]})`);
  check(A.last().k[1] === 0, `B가 남의 키(q)를 보내면 무시됨 (k1=${A.last().k[1]})`);

  section('5) 앞자리 두 명이 Q·W 로 전진 (뒷자리 A·S 는 후진 담당) → 배출구로 이륙/연료 소모');
  A.raw.emit('input', 0x01); B.raw.emit('input', 0x02); C.raw.emit('input', 0); D.raw.emit('input', 0);
  const z0 = A.last().p[2];
  await advance(3000);
  const z1 = A.last().p[2];
  check(z1 < z0 - 5, `Q+W 로 전진 (z ${z0.toFixed(1)} → ${z1.toFixed(1)})`);
  A.raw.emit('input', 0x11); B.raw.emit('input', 0x22); C.raw.emit('input', 0x44); D.raw.emit('input', 0x88);   // 바퀴+배출구
  const f0 = A.last().f;
  await advance(1200);
  const s = A.last();
  check(s.f < f0 - 8, `연료 소모 (${f0.toFixed(1)}% → ${s.f.toFixed(1)}%)`);
  check(s.p[1] > 1.5 || s.ph === 2, `이륙 또는 충돌 (y=${s.p[1].toFixed(1)}, ph=${s.ph})`);
  check(s.ex === 15 || s.ph === 2, `배출구 4개 모두 점화 (ex=${s.ex})`);
  const rate = (() => { const a = A.snaps.slice(-31); return (a.length - 1) / Math.max(0.001, (a[a.length - 1].T - a[0].T)); })();
  check(rate > 25 && rate < 35, `상태 전송 약 30Hz (측정 ${rate.toFixed(1)}Hz, 게임시간 기준)`);

  section('6) 한 명이 나가면 일시정지 → 30초 안에 재접속하면 재개');
  C.raw.close();
  await advance(300);
  check(A.pause && A.pause.name === 'Charlie', `일시정지 알림: ${A.pause && A.pause.name}`);
  const tPaused = A.last().T;
  await advance(1500);
  check(Math.abs(A.last().T - tPaused) < 0.2, '일시정지 중에는 게임 시간이 흐르지 않음');
  // 재접속 (새 소켓)
  const C2 = makeBot(await connect(), 'Charlie');
  r = await C2.call('room:rejoin', { code: A.code, token: C.token });
  check(r.ok, '토큰으로 재접속 성공');
  await advance(300);
  check(A.resume === 1 && C2.init && C2.init.slot === C.init.slot, '재개 알림 + 같은 자리 복원');

  section('7) 재접속 시간 초과 → 로비로 복귀');
  C2.raw.close();
  await advance(500);
  check(A.pause !== null, '다시 일시정지');
  await advance(31000);
  check(A.abort && /로비/.test(A.abort.msg), `30초 내 미복귀 → 로비로 복귀: "${A.abort && A.abort.msg}"`);
  check(A.lobby.n === 3 && A.lobby.phase === 'lobby', '로비에서 인원 3명으로 재조정');
  for (const b of [A, B, C, D]) b.raw.close();

  section('8) 1명 / 2명 키 배분 및 도착(개발 모드로 순간이동)');
  const S = makeBot(await connect(), 'Solo');
  r = await S.call('room:create', { name: 'Solo', debug: true });
  r = await S.call('room:start');
  check(r.ok, '1명은 바로 시작 가능');
  await advance(200);
  check(JSON.stringify(S.init.assign) === '[511]', '1명 = 8키 + 스페이스 전부 담당');
  await advance(3500);
  S.raw.emit('debug', { cmd: 'god', on: true });
  S.raw.emit('debug', { cmd: 'tp', s: 8962 });
  S.raw.emit('input', 0x03);
  await advance(6000);
  check(S.end && S.end.time > 0, `도착! 결과 수신: 시간 ${S.end && S.end.time}s, 사망 ${S.end && S.end.deaths}회`);
  S.raw.emit('room:again');
  await advance(100);
  check(S.lobby && S.lobby.phase === 'lobby', '"다시 하기" → 로비');
  S.raw.close();
  const P1 = makeBot(await connect(), 'P1'), P2 = makeBot(await connect(), 'P2');
  r = await P1.call('room:create', { name: 'P1' });
  await P2.call('room:join', { code: r.code, name: 'P2' });
  P2.raw.emit('room:ready', { ready: true });
  await advance(50);
  r = await P1.call('room:start');
  await advance(100);
  check(JSON.stringify(P1.init.assign) === '[341,426]', '2명 = 왼쪽(q a e d) / 오른쪽(w s r f) + 스페이스 배분');
  P1.raw.close(); P2.raw.close();
}

async function main() {
  if (INPROC) {
    console.log('모드: 프로세스 내부(가짜 소켓, 가상 시간)');
    const { RoomManager } = await import('../server/room.js');
    const { makePair } = await import('./fake-socket.js');
    let vnow = 1000000, n = 0;
    const mgr = new RoomManager({ now: () => vnow });
    const connect = async () => { const { server, client } = makePair('s' + (++n)); mgr.attach(server); return client; };
    const advance = async (ms) => { const end = vnow + ms; while (vnow < end) { vnow += 4; mgr.updateAll(vnow); } };
    await scenario(connect, advance);
  } else {
    let child = null, url = urlArg;
    if (!url) {
      const port = 3100 + Math.floor(Math.random() * 500);
      child = spawn(process.execPath, [path.join(here, '../server/index.js')], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] });
      process.on('exit', () => { try { child.kill(); } catch { /* 이미 종료됨 */ } });   // 어떤 이유로 끝나든 서버 프로세스를 남기지 않음
      // 서버가 "서버 시작" 을 출력할 때까지 대기. 시작 중에 죽거나 15초가 지나면 무한 대기하지 않고 바로 실패 처리.
      await new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error('서버가 15초 안에 시작되지 않았습니다.')), 15000);
        child.stdout.on('data', (d) => { if (String(d).includes('서버 시작')) { clearTimeout(timer); res(); } });
        child.on('error', (e) => { clearTimeout(timer); rej(e); });
        child.on('exit', (code) => { clearTimeout(timer); rej(new Error(`서버가 시작 도중 종료되었습니다 (종료 코드 ${code}). 먼저 터미널에서 npm install 을 실행했는지 확인하세요.`)); });
      });
      url = `http://localhost:${port}`;
    }
    console.log('모드: 실제 네트워크 (Socket.IO)  ' + url);
    const { io } = await import('socket.io-client');
    const socks = [];
    const connect = () => new Promise((res, rej) => {
      const s = io(url, { transports: ['websocket'], forceNew: true, reconnection: false });
      socks.push(s); s.on('connect', () => res(s)); s.on('connect_error', rej);
    });
    const advance = (ms) => new Promise((res) => setTimeout(res, ms));
    try { await scenario(connect, advance); } finally { socks.forEach((s) => s.close()); if (child) child.kill(); }
  }
  console.log(`\n결과: 통과 ${pass}, 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('테스트 중 오류:', e); process.exit(2); });
