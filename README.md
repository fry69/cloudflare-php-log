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

### 4. Configure Environment Variables

Set your Analytics API token as a secret:

```bash
wrangler secret put ANALYTICS_API_TOKEN
# Enter your Cloudflare API token when prompted
```

Note: The Analytics Engine dataset `PHP_LOG` will be created automatically when the worker first writes data to it.

### 5. Set Admin Token (Optional)

For additional security, you can set an admin token to protect the `/_php_log` endpoint:

```bash
wrangler secret put ADMIN_TOKEN
# Enter a secure, randomly generated token when prompted
```

This requires requests to include an `x-admin-token` header. If you prefer to keep the endpoint open, you can comment out the authentication code in `src/index.ts`.

### 6. Update Domain Routing

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
GET /_php_log
```

**Authentication**: Requires `x-admin-token` header with your admin token (if authentication is enabled).

**Example request**:
```bash
curl -H "x-admin-token: your-secret-token" https://your-domain.com/_php_log
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

> **Note**: Authentication is enabled by default. If you prefer to keep the endpoint open (not recommended for production), you can comment out the authentication code in `src/index.ts` around lines 47-50.

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

1. **Admin Endpoint**: The `/_php_log` endpoint is protected by admin token authentication. The token is set during configuration (step 5). If you prefer to disable authentication for testing purposes, comment out lines 47-50 in `src/index.ts`:

```typescript
// const headerToken = request.headers.get("x-admin-token") || "";
// if (headerToken !== env.ADMIN_TOKEN) {
//   return new Response("Unauthorized", { status: 401 });
// }
```

2. **API Token Security**: Keep your Analytics API token and Admin token secure. Never commit them to version control or expose them in client-side code.

3. **Rate Limiting**: Consider implementing rate limiting for the analytics logging to prevent abuse.

4. **Data Retention**: Analytics Engine data is retained according to your Cloudflare plan. Review data retention policies.

## Monitoring

The worker logs PHP access attempts with the following data points:

- **Blobs**: `[path, country, region, user_agent]`
- **Indexes**: `[asn]`
- **Timestamp**: Automatic

You can query this data using the Analytics Engine SQL API or through the built-in `/_php_log` endpoint.

## Custom Queries

You can modify the SQL query in `src/index.ts` to customize the data retrieval:

```sql
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
