export { AlarmChat, ChatRooms } from './do';

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const { method } = request;
		const { pathname, searchParams } = new URL(request.url);
		if (pathname === '/ws') {
			const roomId = searchParams.get('roomId') ?? 'Public';
			const upgrade = request.headers.get('Upgrade');
			if (upgrade?.toLowerCase() === 'websocket') {
				const rooms = env.ROOMS.getByName('global');

				await rooms.createRoom(roomId);

				const ac = env.AC.getByName(roomId);
				return ac.fetch(request);
			}
		}
		if (method === 'GET') {
			if (pathname === '/') {
				return new Response(
					`
					채팅방 ID와 닉네임을 입력하여 채팅방에 접속할 수 있습니다.

					ws://localhost:8787/ws?roomId={채팅방 ID}&nickname={닉네임}

					GET /rooms 채팅방 목록 조회

					`,
				);
			}
			if (pathname === '/rooms') {
				const chatRooms = env.ROOMS.getByName('global');

				const rooms = await chatRooms.getRooms();

				if (rooms.length === 0) {
					return new Response('채팅방이 없습니다.', { status: 200 });
				}

				const body = [
					'--------------------------------',
					'| 채팅방 목록 |',
					'--------------------------------',
					...rooms.map(
						(room) =>
							`채팅방 : ${String(room.room_id).padEnd(16)}  |  마지막 메시지: ${room.last_message_created_at ?? '없음'} |  생성일: ${room.created_at}`,
					),
				].join('\n');

				return new Response(body);
			}
		}
		return new Response('Not found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;
