// Temu Tesla 서버: Express(정적 파일 + /health) + Socket.IO(실시간 멀티플레이)
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { RoomManager } from './room.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.disable('x-powered-by');
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 25000, maxHttpBufferSize: 1e5, cors: { origin: true } });
const rooms = new RoomManager();

// 헬스체크 (Render 헬스체크 / "서버를 깨우는 중" 화면이 사용)
app.get('/health', (req, res) => res.json({ ok: true, uptime: Math.round(process.uptime()), ...rooms.stats() }));

const threeDir = path.join(root, 'node_modules', 'three');
if (!fs.existsSync(threeDir)) console.warn('[경고] node_modules/three 가 없습니다. 먼저 `npm install` 을 실행하세요.');
app.use('/vendor/three', express.static(threeDir, { maxAge: '7d' }));
app.use('/shared', express.static(path.join(root, 'shared'), { maxAge: 0, etag: true }));
app.use(express.static(path.join(root, 'client'), { maxAge: 0, etag: true }));

io.on('connection', (socket) => rooms.attach(socket));
rooms.start();

server.listen(PORT, '0.0.0.0', () => console.log(`[Temu Tesla] 서버 시작: http://localhost:${PORT}  (헬스체크 /health)`));
const stop = () => { rooms.stop(); io.close(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 1500).unref(); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
