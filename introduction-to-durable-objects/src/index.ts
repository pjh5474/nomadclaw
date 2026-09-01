export { DurableCounter } from './do';

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const { pathname } = new URL(request.url);
		const method = request.method;

		const ip = request.headers.get('CF-Connecting-IP') ?? '';
		const city = request.cf?.city ?? '';
		const country = request.cf?.country ?? '';

		if (method === 'POST') {
			if (pathname === '/increment') {
				const dc = env.DC.getByName('count');
				const count = await dc.increase(ip, city, country);

				return new Response(
					`
					COUNT가 증가했습니다. 현재 COUNT는 ${count}입니다.

					--------------------------------
					변경자 정보
					
					IP: ${ip}
					CITY: ${city}
					COUNTRY: ${country}
					--------------------------------
					`,
					{ status: 200 },
				);
			}
			if (pathname === '/decrement') {
				const dc = env.DC.getByName('count');
				const count = await dc.decrease(ip, city, country);

				return new Response(
					`
					COUNT가 감소했습니다. 현재 COUNT는 ${count}입니다.

					--------------------------------
					변경자 정보
					
					IP: ${ip}
					CITY: ${city}
					COUNTRY: ${country}
					--------------------------------
					`,
					{ status: 200 },
				);
			}
			return new Response('페이지가 존재하지 않습니다.', { status: 404 });
		}

		if (method === 'GET') {
			if (pathname === '/') {
				return new Response(
					`
				API 사용법:
				POST /increase - COUNT 증가
				POST /decrease - COUNT 감소
				GET /count - 현재 COUNT 조회
				GET /history - 변경 이력 조회 ( 최근 100개 )
				`,
					{ status: 200 },
				);
			}
			if (pathname === '/count') {
				const dc = env.DC.getByName('count');
				const count = await dc.count();
				return new Response(`현재 COUNT는 ${count}입니다.`, { status: 200 });
			}
			if (pathname === '/history') {
				const dc = env.DC.getByName('count');
				const history = await dc.history();
				return new Response(
					`
					--------------------------------
					COUNT 변경 이력
					--------------------------------
					${history
						.map(
							(item, index) => `
						ID: ${item.id}
						COUNT: ${item.count}
						IP: ${item.ip ?? ''}
						CITY: ${item.city ?? ''}
						COUNTRY: ${item.country ?? ''}
						
						${index % 2 === 0 ? '(～￣▽￣)～' : 'ヾ(≧▽≦*)o'}
					`,
						)
						.join('\n')}
					--------------------------------
					`,
					{ status: 200 },
				);
			}
		}

		return new Response('페이지가 존재하지 않습니다.', { status: 404 });
	},
} satisfies ExportedHandler<Env>;
