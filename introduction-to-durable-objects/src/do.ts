import { DurableObject } from 'cloudflare:workers';

export class DurableCounter extends DurableObject<Env> {
	sql: SqlStorage;
	constructor(ctx: DurableObjectState, env: Env, request: Request) {
		super(ctx, env);

		this.sql = ctx.storage.sql;

		// blockConcurrencyWhile will block the current execution context from running until the promise is resolved or rejected
		// this.ctx.blockConcurrencyWhile(async () => {
		// 	await fetch('.....');
		// });

		this.sql.exec(`
            CREATE TABLE IF NOT EXISTS counts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                count INTEGER,
                ip TEXT,
                city TEXT,
                country TEXT
            );
        `);

		this.sql.exec(`
            INSERT OR IGNORE INTO counts (id, count, ip, city, country) VALUES (1, 0, 'constructor', 'constructor', 'constructor');
        `);
	}

	increase(ip: string, city: string, country: string) {
		const { count } = this.sql.exec(`SELECT count FROM counts order by id desc limit 1`).one() as { count: number };
		this.sql.exec(`INSERT INTO counts (count, ip, city, country) VALUES (?, ?, ?, ?)`, count + 1, ip, city, country);

		return count + 1;
	}

	decrease(ip: string, city: string, country: string) {
		const { count } = this.sql.exec(`SELECT count FROM counts order by id desc limit 1`).one() as { count: number };
		this.sql.exec(`INSERT INTO counts (count, ip, city, country) VALUES (?, ?, ?, ?)`, count - 1, ip, city, country);

		return count - 1;
	}

	count() {
		const { count } = this.sql.exec(`SELECT count FROM counts order by id desc limit 1`).one() as { count: number };
		return count;
	}

	history() {
		const history = this.sql.exec(`SELECT * FROM counts order by id desc limit 100`).toArray() as {
			id: number;
			count: number;
			ip: string;
			city: string;
			country: string;
		}[];
		return history;
	}
}
