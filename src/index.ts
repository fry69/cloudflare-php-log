// index.ts
import { queryAnalyticsEngine } from './analyticsClient';

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const domain = url.hostname;
		const pathname = url.pathname || '/';

		// .php detection; accepts /file.php, /file.php/extra, /file.php?x=1
		function isPhpPath(path: string): boolean {
			return /\.php(?:$|[\/?])/i.test(path);
		}

		// pull cf info safely (Request.cf typing can be missing)
		function extractCfInfo(req: Request) {
			const cf = (req as any).cf || {};
			const country = typeof cf.country === 'string' ? cf.country : 'ZZ';
			const region = typeof cf.region === 'string' ? cf.region : '';
			const asn = cf.asn != null ? String(cf.asn) : '0';
			return { country, region, asn };
		}

		if (isPhpPath(pathname)) {
			try {
				const { country, region, asn } = extractCfInfo(request);
				const uaHeader = request.headers.get('user-agent') || '';
				const ua = uaHeader.slice(0, 140);

				// ensure we always provide a Promise to waitUntil
				const p = Promise.resolve(
					env.PHP_LOG_AE.writeDataPoint({
						blobs: [pathname, country, region, ua],
						doubles: [],
						indexes: [asn],
					})
				).catch((err) => {
					// swallow write errors
					console.error('AE writeDataPoint failed:', err);
				});
				ctx.waitUntil(p);
			} catch (err) {
				console.error('Failed to log .php attempt:', err);
			}
		}

		if (url.pathname === '/_php_log') {
			const headerToken = request.headers.get("x-admin-token") || "";
			if (headerToken !== env.ADMIN_TOKEN) {
			  return new Response("Unauthorized", { status: 401 });
			}

			const sql = `
        SELECT
          timestamp,
					index1 AS asn,
          blob1 AS path,
          blob2 AS country,
          blob3 AS region,
          blob4 AS ua
        FROM PHP_LOG
        WHERE timestamp >= NOW() - INTERVAL '1' DAY
        ORDER BY timestamp DESC
        LIMIT 20
      `;

			try {
				const result = await queryAnalyticsEngine(env.ACCOUNT_ID, env.ANALYTICS_API_TOKEN, sql);
				return new Response(JSON.stringify({ count: result.count, items: result.items }, null, 2), {
					headers: { 'content-type': 'application/json; charset=utf-8' },
				});
			} catch (err) {
				return new Response(`AE query failed: ${String(err)}`, { status: 500 });
			}
		}

		switch (domain) {
			case '<YOUR_OTHER_WORKER_DOMAIN>':
				return await env.SVC_PLACEHOLDER.fetch(request);
			case '<YOUR_PLAIN_DOMAIN>':
			default:
				return await fetch(request);
		}
	},
} satisfies ExportedHandler<Env>;
