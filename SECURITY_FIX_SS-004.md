# Security Fix: SS-004 - Host Service CORS and Authentication Vulnerability

## Vulnerability Summary

**Severity:** CRITICAL (10/10)
**Report ID:** SS-004
**Status:** FIXED ✅

### Description
The desktop application's host-service HTTP server was running with:
- Unrestricted CORS (`Access-Control-Allow-Origin: *`)
- Zero authentication on all endpoints
- Exposed sensitive data and destructive operations

This allowed any malicious website to:
- ✅ Extract GitHub identity (username, email, profile)
- ✅ Extract Superset cloud account information
- ✅ Merge pull requests without authorization
- ✅ Permanently delete local git repositories
- ✅ Access git repository metadata

## Fix Implementation

### 1. Session Token Authentication

**Generated on startup:**
- Cryptographically secure 32-byte random token
- Generated per host-service instance
- Transmitted via IPC to Electron app only
- Required in `Authorization` header for all requests

**Files changed:**
- `packages/host-service/src/security/token.ts` (NEW)
  - `generateSecureToken()` - Generates secure random tokens
  - `secureCompare()` - Constant-time comparison to prevent timing attacks

### 2. Strict CORS Policy

**Before:**
```typescript
app.use("*", cors()); // Allowed ANY origin
```

**After:**
```typescript
app.use("*", cors({
  origin: (origin) => {
    if (!origin) return null; // Block requests with no origin
    const url = new URL(origin);
    const isLocalhost = url.hostname === "localhost" ||
                        url.hostname === "127.0.0.1" ||
                        url.hostname === "[::1]";
    const isElectron = url.protocol === "app:";
    return isLocalhost || isElectron ? origin : null;
  },
  credentials: true,
}));
```

**Files changed:**
- `packages/host-service/src/app.ts`

### 3. Authentication Middleware

**Validates session token on ALL requests:**
```typescript
if (options?.sessionToken) {
  app.use("*", async (c, next) => {
    if (c.req.method === "OPTIONS") return next(); // Allow CORS preflight

    const authHeader = c.req.header("Authorization") ||
                       c.req.header("X-Session-Token");

    if (!authHeader) {
      return c.json({ error: "Unauthorized: Missing session token" }, 401);
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    if (!secureCompare(token, options.sessionToken)) {
      return c.json({ error: "Unauthorized: Invalid session token" }, 401);
    }

    return next();
  });
}
```

**Files changed:**
- `packages/host-service/src/app.ts`

### 4. Token Distribution via IPC

**Desktop entry point:**
```typescript
// Generate token
const sessionToken = randomBytes(32).toString("hex");

// Pass to createApp
const { app, injectWebSocket } = createApp({
  // ... other options
  sessionToken,
});

// Send to parent Electron process via IPC
process.send?.({ type: "ready", port: info.port, sessionToken });
```

**Files changed:**
- `apps/desktop/src/main/host-service/index.ts`
- `apps/desktop/src/main/lib/host-service-manager.ts`

### 5. Client-Side Integration

**tRPC client sends token:**
```typescript
httpBatchLink({
  url: `${hostUrl}/trpc`,
  transformer: superjson,
  headers: () => {
    if (sessionToken) {
      return {
        Authorization: `Bearer ${sessionToken}`,
      };
    }
    return {};
  },
})
```

**Files changed:**
- `apps/desktop/src/renderer/lib/host-service-client.ts`
- `apps/desktop/src/lib/trpc/routers/host-service-manager/index.ts`
- `apps/desktop/src/renderer/routes/_authenticated/providers/HostServiceProvider/HostServiceProvider.tsx`

## Files Modified

### New Files
1. `packages/host-service/src/security/token.ts`
2. `packages/host-service/src/security/index.ts`

### Modified Files
1. `packages/host-service/src/app.ts`
2. `packages/host-service/src/serve.ts`
3. `packages/host-service/src/index.ts`
4. `apps/desktop/src/main/host-service/index.ts`
5. `apps/desktop/src/main/lib/host-service-manager.ts`
6. `apps/desktop/src/renderer/lib/host-service-client.ts`
7. `apps/desktop/src/lib/trpc/routers/host-service-manager/index.ts`
8. `apps/desktop/src/renderer/routes/_authenticated/providers/HostServiceProvider/HostServiceProvider.tsx`

## Testing the Fix

### 1. Verify Authentication is Required

**Test without token (should fail):**
```bash
# Start the desktop app
bun dev

# Try to access without token
curl http://127.0.0.1:4879/trpc/health.check

# Expected: 401 Unauthorized
```

**Test with invalid token (should fail):**
```bash
curl -H "Authorization: Bearer invalid_token" \
  http://127.0.0.1:4879/trpc/health.check

# Expected: 401 Unauthorized
```

**Test with valid token (should succeed):**
```bash
# Get the session token from logs or Electron DevTools
SESSION_TOKEN="<token_from_logs>"

curl -H "Authorization: Bearer $SESSION_TOKEN" \
  http://127.0.0.1:4879/trpc/health.check

# Expected: 200 OK
```

### 2. Verify CORS Protection

**Create a test HTML file:**
```html
<!DOCTYPE html>
<html>
<head><title>CORS Test</title></head>
<body>
<script>
// This should fail with CORS error
fetch('http://127.0.0.1:4879/trpc/github.getUser')
  .then(r => r.json())
  .then(data => {
    console.log('SECURITY ISSUE: Request succeeded!', data);
    document.body.innerHTML = '<h1 style="color:red">SECURITY ISSUE: CORS bypass!</h1>';
  })
  .catch(err => {
    console.log('CORS blocked correctly:', err);
    document.body.innerHTML = '<h1 style="color:green">CORS protection working ✓</h1>';
  });
</script>
</body>
</html>
```

Open this HTML file in a browser. You should see:
- Console error: `Access to fetch ... has been blocked by CORS policy`
- Message: "CORS protection working ✓"

### 3. Verify Electron App Works Normally

1. Start the desktop app: `bun dev`
2. Login to your Superset account
3. Create a new workspace
4. Verify all features work:
   - Git operations
   - Pull request viewing
   - GitHub integration
   - Workspace creation/deletion

### 4. Test Standalone Mode (Development)

```bash
cd packages/host-service
bun run src/serve.ts

# Note the session token printed in logs
# Use it to make authenticated requests
```

## Security Considerations

### ✅ What This Fixes
- **Cross-Origin Attacks:** Malicious websites can no longer access the host-service
- **Data Exfiltration:** GitHub identity and Superset account info are protected
- **Unauthorized Actions:** PR merges and repo deletions require authentication
- **Port Scanning:** Even if port is discovered, token is still required

### ⚠️ Remaining Considerations
1. **Remote Host Services:** Connections to other devices' host-services need separate authentication (future work)
2. **Token Rotation:** Tokens are per-session; consider implementing rotation for long-running instances
3. **Network Exposure:** Service still binds to 127.0.0.1 (localhost only), should never bind to 0.0.0.0

### 🔒 Best Practices Applied
- ✅ Cryptographically secure random tokens (32 bytes)
- ✅ Constant-time comparison to prevent timing attacks
- ✅ Strict CORS with origin validation
- ✅ Secure token transmission via IPC (not exposed to network)
- ✅ Defense in depth (CORS + authentication)

## Rollout Plan

1. **Testing Phase:**
   - Internal testing with security team
   - Verify all endpoints require authentication
   - Test CORS protection with various browsers
   - Verify Electron app functionality

2. **Deployment:**
   - Merge to main branch
   - Include in next desktop app release
   - Update CHANGELOG.md with security fix notice

3. **Communication:**
   - Security advisory for users to update
   - Document new development workflow (session token in logs)
   - Update README with security information

## References

- Original vulnerability report: SS-004
- OWASP CORS: https://owasp.org/www-community/attacks/csrf
- Token-based authentication: https://oauth.net/2/bearer-tokens/
- Constant-time comparison: https://codahale.com/a-lesson-in-timing-attacks/
