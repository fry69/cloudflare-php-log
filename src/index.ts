// index.ts

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const domain = url.hostname;
		const pathname = url.pathname || '/';

		// .php detection; accepts /file.php, /file.php/extra, /file.php?x=1
		function isPhpPath(path: string): boolean {
			return /\.php(?:$|[\/?])/i.test(path);
		}

		// API path detection: all path which start with /_php_log
		function isAPIPath(path: string): boolean {
			return /^\/_php_log/i.test(path);
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
						blobs: [pathname, country, region, ua, asn],
						doubles: [1],
						indexes: [crypto.randomUUID()],
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

		if (isAPIPath(pathname)) {
			if (env.QUERY_TOKEN !== '') {
				// Check API token
				const authHeader = request.headers.get('authorization') || '';
				const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
				if (token !== env.QUERY_TOKEN) {
					return new Response('Unauthorized\n', { status: 401 });
				}
			}

			let sql = '';

			switch (pathname) {
				case '/_php_log_last':
					sql = `
			  SELECT
			    timestamp,
			    blob1 AS path,
			    blob2 AS country,
			    blob3 AS region,
			    blob4 AS ua,
			    blob5 AS asn
			  FROM PHP_LOG
			  WHERE timestamp >= NOW() - INTERVAL '1' DAY
			  ORDER BY timestamp DESC
			  LIMIT 20
			`;
					break;
				case '/_php_log':
				case '/_php_log_top':
					sql = `
        SELECT
          blob1 AS path,
          count() AS hits
        FROM PHP_LOG
        WHERE timestamp >= NOW() - INTERVAL '1' MONTH
				GROUP BY path
        ORDER BY hits DESC
        LIMIT 20
      `;
					break;
				default:
					return new Response('API not found\n', { status: 404 });
			}

			if (sql !== '') {
				const CACHE_TTL_SECONDS = 60; // 1 minute cache TTL (minium KV allows)

				// Try to get cached response from KV
				let cachedResponse = await env.PHP_LOG_KV.get(pathname, { type: 'json' });

				if (cachedResponse) {
					return new Response(JSON.stringify(cachedResponse, null, 2), {
						headers: { 'content-type': 'application/json; charset=utf-8', 'x-cache': 'HIT' },
					});
				}

				// No cache, we have to query the actual AE API
				try {
					const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/analytics_engine/sql`, {
						method: 'POST',
						headers: {
							Authorization: `Bearer ${env.ANALYTICS_API_TOKEN}`,
							'Content-Type': 'text/plain',
						},
						body: sql,
					});
					if (!response.ok) {
						const txt = await response.text().catch(() => '');
						throw new Error(`AE API: ${response.status}: ${txt}`);
					}
					const result: any = await response.json();

					// Store result in KV cache
					await env.PHP_LOG_KV.put(pathname, JSON.stringify(result.data), { expirationTtl: CACHE_TTL_SECONDS });

					return new Response(JSON.stringify(result.data, null, 2), {
						headers: { 'content-type': 'application/json; charset=utf-8', 'x-cache': 'MISS' },
					});
				} catch (err) {
					return new Response(`${String(err)}\n`, { status: 500 });
				}
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
