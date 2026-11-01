// ============ WebSocket 服务端：实时世界同步 ============
import { WebSocketServer, WebSocket } from 'ws';
import { worldManager } from '@/server/engine';
import { prisma } from '@/server/prisma';

interface ClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'directive' | 'heartbeat' | 'request_state';
  payload: any;
}

interface ServerMessage {
  type: 'state' | 'delta' | 'event' | 'directive_result' | 'error' | 'heartbeat_ack';
  payload: any;
}

const connections = new Map<string, Set<WebSocket>>(); // worldId -> Set<ws>
const clientInfo = new Map<WebSocket, { worldId: string; playerId: string; lastHeartbeat: number }>();

export function setupWebSocketServer(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket, req) => {
    console.log('[WS] New connection');

    ws.on('message', async (data: Buffer) => {
      try {
        const msg: ClientMessage = JSON.parse(data.toString());
        await handleMessage(ws, msg);
      } catch (e) {
        console.error('[WS] Message parse error:', e);
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid message format' } } as ServerMessage));
      }
    });

    ws.on('close', () => handleDisconnect(ws));
    ws.on('error', (err) => console.error('[WS] Error:', err));

    // 发送欢迎消息
    ws.send(JSON.stringify({ type: 'heartbeat_ack', payload: { time: Date.now() } } as ServerMessage));
  });

  // 定期清理僵尸连接
  setInterval(() => {
    const now = Date.now();
    for (const [ws, info] of clientInfo) {
      if (now - info.lastHeartbeat > 60000) { // 60秒无心跳
        console.log('[WS] Cleaning up stale connection');
        handleDisconnect(ws);
      }
    }
  }, 30000);
}

async function handleMessage(ws: WebSocket, msg: ClientMessage) {
  const info = clientInfo.get(ws);

  switch (msg.type) {
    case 'subscribe': {
      const { worldId, playerId } = msg.payload;
      if (!worldId || !playerId) {
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Missing worldId or playerId' } } as ServerMessage));
        return;
      }

      // 验证玩家权限
      const worldPlayer = await prisma.worldPlayer.findUnique({
        where: { worldId_playerId: { worldId, playerId } },
      });
      if (!worldPlayer) {
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Not authorized for this world' } } as ServerMessage));
        return;
      }

      // 加入世界房间
      if (!connections.has(worldId)) connections.set(worldId, new Set());
      connections.get(worldId)!.add(ws);
      clientInfo.set(ws, { worldId, playerId, lastHeartbeat: Date.now() });

      // 加载世界并发送当前状态
      const world = worldManager.getWorld(worldId) || await worldManager.loadWorld(worldId);
      if (world) {
        ws.send(JSON.stringify({ type: 'state', payload: world.getSnapshot() } as ServerMessage));
      }

      console.log(`[WS] Player ${playerId} subscribed to world ${worldId}`);
      break;
    }

    case 'unsubscribe': {
      handleDisconnect(ws);
      break;
    }

    case 'heartbeat': {
      if (info) {
        info.lastHeartbeat = Date.now();
        ws.send(JSON.stringify({ type: 'heartbeat_ack', payload: { time: Date.now() } } as ServerMessage));
      }
      break;
    }

    case 'request_state': {
      if (!info) return;
      const world = worldManager.getWorld(info.worldId);
      if (world) {
        ws.send(JSON.stringify({ type: 'state', payload: world.getSnapshot() } as ServerMessage));
      }
      break;
    }

    case 'directive': {
      if (!info) return;
      const world = worldManager.getWorld(info.worldId);
      if (!world) return;

      const result = await world.executeDirective(info.playerId, msg.payload);
      ws.send(JSON.stringify({ type: 'directive_result', payload: { ...result, requestId: msg.payload.requestId } } as ServerMessage));

      // 广播给同世界其他玩家
      broadcastToWorld(info.worldId, { type: 'event', payload: { type: 'directive', playerId: info.playerId, directive: msg.payload } }, ws);
      break;
    }
  }
}

function handleDisconnect(ws: WebSocket) {
  const info = clientInfo.get(ws);
  if (info) {
    const { worldId } = info;
    const conns = connections.get(worldId);
    if (conns) {
      conns.delete(ws);
      if (conns.size === 0) connections.delete(worldId);
    }
    clientInfo.delete(ws);
    console.log(`[WS] Player ${info.playerId} unsubscribed from world ${worldId}`);
  }
}

function broadcastToWorld(worldId: string, msg: ServerMessage, exclude?: WebSocket) {
  const conns = connections.get(worldId);
  if (!conns) return;
  const data = JSON.stringify(msg);
  for (const ws of conns) {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

// 供 HTTP 路由调用：广播世界状态变更
export function broadcastWorldUpdate(worldId: string, delta: any) {
  broadcastToWorld(worldId, { type: 'delta', payload: delta });
}