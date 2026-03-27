# AGENTS.md - Healthclaw Coding Guidelines

## Build Commands

```bash
bun run server       # Start server (port 3001)
bun run typecheck    # Type checking only
bun run build        # Compile to dist/
bun install          # Install dependencies
```

## Architecture

Clean Architecture layers (dependency direction):

```
domain/ → infrastructure/ → application/ → channels/
```

- **domain/**: Core business logic, zero dependencies
- **infrastructure/**: Storage, logger, message-bus
- **application/**: Use cases, session management, agent factory
- **channels/**: Channel adapters (WebSocket, etc.)
- **config/**: Environment configuration

## TypeScript Guidelines

- **Strict mode enabled** - no implicit any
- Use `interface` for object shapes, `type` for unions
- Explicit return types on public functions
- Arrow functions for callbacks, regular functions for factories

## Naming Conventions

- **Functions**: camelCase, factories prefixed with `create` (e.g., `createHealthAgent`)
- **Interfaces/Types**: PascalCase (e.g., `ChannelAdapter`, `HealthDataType`)
- **Files**: kebab-case.ts (e.g., `file-storage.ts`)
- **Constants**: UPPER_SNAKE_CASE

## Import Rules

```typescript
// 1. External dependencies
import { Agent } from '@mariozechner/pi-agent-core';

// 2. Type imports with 'type' keyword
import type { Storage } from '../../infrastructure/storage/interface.js';

// 3. Internal imports
import { logger } from '../../infrastructure/logger.js';

// 4. Relative paths MUST include .js extension (ESM)
import { HEALTH_ADVISOR_PROMPT } from './prompt.js';
```

**Path Aliases** (tsconfig.json):
- `@domain/*` → `./src/domain/*`
- `@infrastructure/*` → `./src/infrastructure/*`
- `@application/*` → `./src/application/*`
- `@channels/*` → `./src/channels/*`
- `@config` → `./src/config/index.ts`

## Logging

Use **pino** from infrastructure:

```typescript
import { logger } from '../../infrastructure/logger.js';

// Format: [module] message key=value
logger.info('[storage] record type=%s id=%s', data.type, id);
logger.debug('[session] accessed userId=%s', userId);
logger.error('[agent] error: %s', error.message);
```

**Never use console.log**.

## Error Handling

```typescript
try {
  await operation();
} catch (err) {
  logger.error('[module] failed: %s', (err as Error).message);
  throw err; // or return error response
}
```

## File Organization

Each module should have:
- `types.ts` - Interface/type definitions
- `index.ts` or implementation files

Example:
```
session/
├── types.ts      # Session, SessionManager interfaces
└── manager.ts    # createSessionManager implementation
```

## Environment Variables

Configured in `src/config/index.ts`:

- `PORT` - Server port (default: 3001)
- `WORKSPACE_PATH` - Data storage path (default: ./workspace)
- `LLM_PROVIDER` - AI provider (default: anthropic)
- `LLM_MODEL` - Model name
- `LOG_LEVEL` - debug/info/warn/error (default: debug)
- `NODE_ENV` - development/production

## Adding New Channels

1. Create adapter implementing `ChannelAdapter` interface
2. Place in `src/channels/{name}/adapter.ts`
3. Instantiate in `src/main.ts`
4. Call `onMessage()` to set handler

See `src/channels/websocket/adapter.ts` for reference.

## Key Dependencies

- `@mariozechner/pi-agent-core` - Agent framework
- `@mariozechner/pi-ai` - AI model integration
- `@sinclair/typebox` - JSON schema validation
- `pino` - Logging
- `ws` - WebSocket server
- `dotenv` - Environment configuration

## Patterns

**Factory Pattern:**
```typescript
export const createFileStorage = (dataPath: string): Storage => {
  // implementation
  return { record, query };
};
```

**Interface Segregation:**
```typescript
export interface SessionManager {
  getOrCreate(userId: string): Session;
  get(userId: string): Session | undefined;
  remove(userId: string): boolean;
  list(): string[];
}
```
