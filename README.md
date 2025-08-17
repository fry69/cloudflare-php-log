# Cloudflare PHP Log Analytics Worker

A Cloudflare Worker that detects and logs attempts to access PHP files on your domain using Cloudflare Analytics Engine. This is useful for monitoring potential attacks or suspicious activity on non-PHP websites.

## Features

- **PHP Path Detection**: Automatically detects requests to `.php` files (e.g., `/admin.php`, `/wp-admin.php`, `/config.php`)
- **Analytics Logging**: Logs PHP access attempts to Cloudflare Analytics Engine with:
  - Request path
  - Country and region (from Cloudflare's geo data)
  - ASN (Autonomous System Number)
  - User agent (truncated to 140 characters)
- **Query Interface**: Built-in endpoint to view recent PHP access attempts
- **Service Binding**: Can route traffic to other workers based on domain
- **Proxy Fallback**: Passes through legitimate traffic to origin servers

## Architecture

The worker operates as a reverse proxy that:
1. Intercepts all incoming requests
2. Checks if the request path contains `.php`
3. If yes, logs the attempt to Analytics Engine
4. Routes traffic based on domain configuration
5. Provides an admin endpoint to view logged attempts

## Prerequisites

- Cloudflare account with Workers enabled
- Analytics Engine enabled (go to "Storage & Databases -> Analytics Engine" in your Cloudflare dashboard)
- KV namespace set
- Node.js and pnpm installed
- Wrangler CLI configured with your Cloudflare credentials

## Configuration

### 1. Clone and Install

```bash
git clone <repository-url>
cd cloudflare-php-log
pnpm install
```

### 2. Configure wrangler.jsonc

Replace the following placeholders in `wrangler.jsonc`:

```jsonc
{
  "vars": {
    "ACCOUNT_ID": "<YOUR_ACCOUNT_ID>" // Replace with your Cloudflare Account ID
  },
  "services": [
    {
      "binding": "SVC_PLACEHOLDER",
      "service": "<OTHER_WORKER>" // Replace with another worker name if using service bindings
    }
  ],
  "routes": [
    {
      "pattern": "<YOUR_DOMAIN>", // Replace with your actual domain (e.g., "example.com/*")
      "custom_domain": true
    }
  ]
}
```

### 3. Create Analytics API Token

Create a Cloudflare API token for Analytics Engine queries:

1. Read [Cloudflare API Tokens](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
2. Go to your Profile
3. Click "Create Token"
4. Use "Custom token" template
5. Configure the token with minimal privileges:
   - **Permissions**: `Account:Account Analytics:Read`
   - **Account Resources**: Include your account
6. Create the token and copy it securely

> **Important**: Keep your API token secure and never commit it to version control. This token has read access to your account analytics data.

### 4. Create KV Namespace

Create a KV namespace for caching. This protects the Analytics Engine API, if your query endpoints get repeatedly called. The default cache time is 1 minute (minimum KV allows).

```shell
wrangler kv namespace create php_log
```

This will generate an ID for your KV namespace:

```json
{
  "kv_namespaces": [
    {
      "binding": "php_log",
      "id": "<YOUR_KV_ID>"
    }
  ]
}
```

Replace this id with the placeholder in `wrangler.jsonc`.

### 5. Configure Environment Variables

Set your Analytics API token as a secret:

```bash
wrangler secret put ANALYTICS_API_TOKEN
# Enter your Cloudflare API token when prompted
```

Note: The Analytics Engine dataset `PHP_LOG` will be created automatically when the worker first writes data to it.

### 6. Set Query Token

For additional security, you can set an admin token to protect the `/_php_log*` endpoints:

```bash
wrangler secret put QUERY_TOKEN
# Enter a secure, randomly generated token when prompted or hit enter for no auth
```

This requires requests to include an `autorization` header. If you prefer to keep the endpoint open, you can set an empty `QUERY_TOKEN`. Setting this secret is required, even if empty, otherwise the worker will complain.

### 7. Update Domain Routing

In `src/index.ts`, replace the domain placeholders:

```typescript
switch (domain) {
  case '<YOUR_OTHER_WORKER_DOMAIN>': // Replace with actual domain for service binding
    return await env.SVC_PLACEHOLDER.fetch(request);
  case '<YOUR_PLAIN_DOMAIN>': // Replace with your main domain
  default:
    return await fetch(request);
}
```

### Required Replacements Summary

| Placeholder | Location | Description | Example |
|-------------|----------|-------------|---------|
| `<YOUR_ACCOUNT_ID>` | `wrangler.jsonc` | Your Cloudflare Account ID | `1234567890abcdef1234567890abcdef` |
| `<OTHER_WORKER>` | `wrangler.jsonc` | Name of another worker for service binding | `my-api-worker` |
| `<YOUR_DOMAIN>` | `wrangler.jsonc` | Your domain pattern for routing | `example.com/*` |
| `<YOUR_OTHER_WORKER_DOMAIN>` | `src/index.ts` | Domain that should route to service binding | `api.example.com` |
| `<YOUR_PLAIN_DOMAIN>` | `src/index.ts` | Your main domain | `example.com` |

## API Endpoints

### View PHP Access Logs

```
GET /_php_log_top
```

> **Note:** `/_php_log` now defaults to `/_php_log_top`

**Authentication**: Requires `authorization` header with your admin token (if authentication is enabled).

**Example request**:
```bash
curl -H "authorization: Bearer your-secret-token" https://your-domain.com/_php_log_top
```

Returns the top 20 PHP access attempts from the past month:

```json
[
  {
    "path": "/wp-admin/setup-config.php",
    "hits": "123"
  },
]
```

```bash
curl -H authorization: Bearer your-secret-token" https://your-domain.com/_php_log_last
```

Returns the last 20 PHP access attempts (capped to cast 24 hours):

```json
{
  [
    {
      "timestamp": "2025-08-16T10:30:00.000Z",
      "asn": "13335",
      "path": "/wp-admin.php",
      "country": "US",
      "region": "CA",
      "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36..."
    }
  ]
}
```

Returns the last 20 PHP access attempts from the past 24 hours:

```json
{
  "count": 5,
  "items": [
    {
      "timestamp": "2025-08-16T10:30:00.000Z",
      "asn": "13335",
      "path": "/wp-admin.php",
      "country": "US",
      "region": "CA",
      "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36..."
    }
  ]
}
```

> **Note**: Authentication is optional. If you leave the `QUERY_TOKEN` secret empty (just hit enter when setting the secret with `wrangler secret put QUERY_TOKEN`), anyone can access the API endpoints. They are procteded via a KV cache against hammering though.

## Development

### Local Development

```bash
pnpm dev
```

### Testing

```bash
pnpm test
```

### Deployment

```bash
pnpm deploy
```

### Generate Types

```bash
pnpm cf-typegen
```

## Security Considerations

1. **Query Endpoints**: The `/_php_log*` endpoints can get protected by token authentication. The token is set during configuration (step 5). If you prefer to disable authentication for testing purposes, set an empty `QUERY_TOKEN` secret.

2. **API Token Security**: Keep your Analytics API token and query token secure. Never commit them to version control or expose them in client-side code.

3. **Rate Limiting**: Consider implementing rate limiting for the analytics logging to prevent abuse.

4. **Data Retention**: Analytics Engine data is retained according to your Cloudflare plan. Review data retention policies.

## Monitoring

The worker logs PHP access attempts with the following data points:

- **Blobs**: `[path, country, region, user_agent, asn]`
- **Indexes**: `[auto generated UUID]`
- **Timestamp**: Automatic

You can query this data using the Analytics Engine SQL API or through the built-in `/_php_log_last` and `/_php_log_top` endpoints.

## Custom Queries

You can modify SQL queries and API endpoints in `src/index.ts` to customize the data retrieval:

```sql
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
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions:
- Check the [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/)
- Review [Analytics Engine documentation](https://developers.cloudflare.com/analytics/analytics-engine/)
- Open an issue in this repository
