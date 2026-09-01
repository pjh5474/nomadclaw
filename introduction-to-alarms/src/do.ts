import { DurableObject } from 'cloudflare:workers';

export class AlarmChat extends DurableObject<Env> {
	sql: SqlStorage;
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.sql = ctx.storage.sql;

		this.sql.exec(
			`
            CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            nickname TEXT, 
            message TEXT, 
            created_at TEXT
            )
            `,
		);
	}

	async alarm() {
		// delete messages older than 5 minutes and set alarm for every 1 minutes
		this.sql.exec(`DELETE FROM messages WHERE created_at < DATETIME('now', '-5 minutes')`);
		await this.ctx.storage.setAlarm(Date.now() + 60 * 1000);
	}

	async fetch(request: Request) {
		const currentAlarm = await this.ctx.storage.getAlarm();

		if (currentAlarm === null) {
			await this.ctx.storage.setAlarm(Date.now() + 60 * 1000);
		}

		const url = new URL(request.url);
		const nickname = url.searchParams.get('nickname') ?? 'Anon';
		const roomId = url.searchParams.get('roomId') ?? 'Public';
		const webSocketPair = new WebSocketPair();

		const [client, server] = Object.values(webSocketPair);

		this.ctx.acceptWebSocket(server);

		server.serializeAttachment({ nickname, roomId });

		const previousMessages = this.sql
			.exec(
				`
            SELECT id, nickname, message, created_at
            FROM messages
            ORDER BY created_at ASC
        `,
			)
			.toArray();

		if (previousMessages.length > 0) {
			server.send(`----- 이전 대화 목록 ------`);

			for (const previousMessage of previousMessages) {
				server.send(`${previousMessage.nickname || 'Anon'}: ${previousMessage.message}`);
			}

			server.send(`--------------------------`);
		}

		this.broadcast(`${nickname || 'Anon'} 님이 입장했습니다.`);

		return new Response(null, { status: 101, webSocket: client });
	}

	broadcast(message: string, exclude?: WebSocket) {
		for (const socket of this.ctx.getWebSockets()) {
			if (socket !== exclude) {
				socket.send(message);
			}
		}
	}

	async webSocketMessage(ws: WebSocket, message: string) {
		const { nickname, roomId } = ws.deserializeAttachment() as { nickname: string; roomId: string };
		this.sql.exec(
			`
            INSERT INTO messages (nickname, message, created_at) VALUES (?, ?, DATETIME('now'))
            `,
			nickname,
			message,
		);

		await this.env.ROOMS.getByName('global').updateLastMessage(roomId);

		this.broadcast(`${nickname || 'Anon'}: ${message}`, ws);
	}

	webSocketClose(ws: WebSocket) {
		const { nickname } = ws.deserializeAttachment() as { nickname: string };
		this.broadcast(`${nickname || 'Anon'} 님이 나갔습니다.`);
	}

	getMessages() {
		const messages = this.sql.exec(`SELECT * FROM messages ORDER BY created_at DESC LIMIT 100`).toArray();
		return messages;
	}
}

export class ChatRooms extends DurableObject<Env> {
	sql: SqlStorage;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);

		this.sql = ctx.storage.sql;

		this.sql.exec(`
            CREATE TABLE IF NOT EXISTS rooms (
                room_id TEXT PRIMARY KEY,
                created_at TEXT,
                last_message_created_at TEXT
            )
        `);
	}

	createRoom(roomId: string) {
		this.sql.exec(
			`
            INSERT OR IGNORE INTO rooms (room_id, created_at)
            VALUES (?, ?)
            `,
			roomId,
			new Date().toISOString(),
		);
	}

	updateLastMessage(roomId: string) {
		this.sql.exec(
			`
            UPDATE rooms
            SET last_message_created_at = DATETIME('now')
            WHERE room_id = ?
            `,
			roomId,
		);
	}

	getRooms() {
		return this.sql
			.exec(
				`
                SELECT 
                room_id,
                last_message_created_at,
                created_at
                FROM rooms
                ORDER BY last_message_created_at DESC
            `,
			)
			.toArray();
	}
}
