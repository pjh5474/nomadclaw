export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;
		const method = request.method;

		const notematch = path.match(/^\/notes\/([^\/]+)$/);

		if (method === 'GET') {
			if (path === '/') {
				return new Response(`
				API 사용법:
				GET /notes - 모든 노트 목록 조회
				GET /notes/<key> - 특정 노트 조회
				POST /notes/<key> - 노트 생성
				`);
			}
			if (path === '/notes') {
				const notes = await env.CLAW_KV_DB.list();

				const keys = notes.keys.map((item) => item.name);
				return new Response(
					`
					저장된 모든 노트 키 목록: ${keys.join(', ')}
					`,
					{ status: 200 },
				);
			}
			if (notematch) {
				const key = decodeURIComponent(notematch[1]);
				const value = (await env.CLAW_KV_DB.get(key)) ?? null;
				if (value) {
					return new Response(
						`
						해당 키의 노트를 조회했습니다.
						키: ${key} 값: ${value}
						`,
						{ status: 200 },
					);
				}
				return new Response(
					`
					아직 해당 키의 노트가 없습니다: ${key}.
					GET /notes 명령어를 사용하여 저장된 모든 노트 키 목록을 조회할 수 있습니다.
					`,
					{ status: 404 },
				);
			}

			return new Response(
				`
				잘못된 경로입니다. 아래 명령어를 참고하세요.

				API 사용법:
				GET /notes - 모든 노트 목록 조회
				GET /notes/<key> - 특정 노트 조회
				POST /notes/<key> - 노트 생성
				`,
				{ status: 404 },
			);
		}

		if (method === 'POST') {
			if (notematch) {
				const key = decodeURIComponent(notematch[1]);
				const content = await request.text();

				const previous = (await env.CLAW_KV_DB.get(key)) ?? null;

				await env.CLAW_KV_DB.put(key, content);

				if (previous) {
					return new Response(
						`
						해당 키의 노트를 업데이트했습니다. 키: ${key} 값: ${previous} -> ${content}
						GET /notes/${key} 명령어를 사용하여 해당 노트를 조회할 수 있습니다.
						`,
						{ status: 200 },
					);
				}

				return new Response(
					`
					노트가 성공적으로 생성되었습니다. 키: ${key} 값: ${content}
					GET /notes/${key} 명령어를 사용하여 해당 노트를 조회할 수 있습니다.
					`,
					{ status: 201 },
				);
			}
			return new Response(
				`
				잘못된 경로입니다. 아래 명령어를 참고하세요.

				API 사용법:
				GET /notes - 모든 노트 목록 조회
				GET /notes/<key> - 특정 노트 조회
				POST /notes/<key> - 노트 생성
				`,
				{ status: 404 },
			);
		}
		return new Response(
			`
			이 메서드는 허용되지 않습니다. 아래 명령어를 참고하세요.

			API 사용법:
			GET /notes - 모든 노트 목록 조회
			GET /notes/<key> - 특정 노트 조회
			POST /notes/<key> - 노트 생성
			`,
			{ status: 405 },
		);
	},
} satisfies ExportedHandler<Env>;
