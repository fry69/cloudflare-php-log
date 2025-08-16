// analyticsClient.ts
export type AEQueryResult<T = any> = { count: number; items: T[] };

/**
 * Safe extractor helpers that accept `unknown` (the shape from res.json())
 * and perform runtime shape checks before accessing properties.
 */
function extractCols(body: unknown): string[] {
	if (!body || typeof body !== 'object') return [];
	const anyBody = body as any;

	const schemaCols = anyBody?.meta?.schema?.columns;
	if (Array.isArray(schemaCols) && schemaCols.every((c: any) => c && typeof c.name === 'string')) {
		return schemaCols.map((c: any) => String(c.name));
	}

	const metaCols = anyBody?.meta?.columns;
	if (Array.isArray(metaCols) && metaCols.every((c: any) => typeof c === 'string')) {
		return metaCols.map(String);
	}

	if (Array.isArray(anyBody?.columns) && anyBody.columns.every((c: any) => typeof c === 'string')) {
		return anyBody.columns.map(String);
	}

	return [];
}

function extractRows(body: unknown): any[] {
	if (!body || typeof body !== 'object') return [];
	const anyBody = body as any;

	if (Array.isArray(anyBody.data)) return anyBody.data;
	if (Array.isArray(anyBody.rows)) return anyBody.rows;
	if (Array.isArray(anyBody.result)) return anyBody.result;
	// items might be objects already
	if (Array.isArray(anyBody.items)) return anyBody.items;
	return [];
}

/**
 * Query Analytics Engine SQL API safely and return a typed result.
 * - Parses various AE response shapes
 * - Converts column/row matrix into objects when possible
 */
export async function queryAnalyticsEngine<T = any>(accountId: string, apiToken: string, sql: string): Promise<AEQueryResult<T>> {
	const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`;
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiToken}`,
			'Content-Type': 'text/plain',
		},
		body: sql,
	});

	if (!res.ok) {
		const txt = await res.text().catch(() => '');
		throw new Error(`Analytics API error ${res.status}: ${txt}`);
	}

	const body = (await res.json().catch(() => ({}))) as unknown;

	const cols = extractCols(body);
	const rows = extractRows(body);

	let items: T[] = [];

	// If we have column names and rows are array-of-arrays, convert to objects
	if (cols.length > 0 && Array.isArray(rows) && rows.length > 0 && Array.isArray(rows[0])) {
		items = rows.map((rowArr) => {
			const obj: Record<string, any> = {};
			for (let i = 0; i < cols.length; i++) {
				obj[cols[i]] = rowArr[i];
			}
			return obj as T;
		});
	} else if (Array.isArray(rows) && rows.length > 0 && typeof rows[0] === 'object') {
		// If AE returned an array of objects already (e.g., items), use that
		items = rows as T[];
	} else {
		// fallback: return whatever rows were
		items = (rows as T[]) || [];
	}

	return { count: items.length, items };
}
