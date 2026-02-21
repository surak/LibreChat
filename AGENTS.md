# Agent Guidelines for LibreChat

This document provides guidelines for AI agents working on the LibreChat codebase.

## Project Overview

LibreChat is a monorepo with workspaces for `api` (backend), `client` (frontend React app), and `packages/*` (shared libraries). The project uses React 18, TypeScript, Express, and is currently running in **stateless mode** using in-memory storage instead of MongoDB.

## Build Commands

### Full Build

- `npm run build:packages` - Build all packages (data-provider, data-schemas, api, client)
- `npm run frontend` - Build frontend packages and client

### Individual Package Builds

- `npm run build:data-provider` - Build @librechat/data-provider package
- `npm run build:api` - Build @librechat/api package
- `npm run build:data-schemas` - Build @librechat/data-schemas package
- `npm run build:client` - Build React frontend client
- `npm run build:client-package` - Build @librechat/client package

### Development Servers

- `npm run frontend:dev` - Start Vite dev server for client
- `npm run backend:dev` - Start nodemon dev server for API
- `npm run backend` - Start production API server

## Testing

### Unit Tests

- `npm run test:client` - Run client tests (Jest, in client directory)
- `npm run test:api` - Run API tests (Jest, in api directory)
- `npm run test:packages:api` - Run packages/api tests
- `npm run test:packages:data-provider` - Run packages/data-provider tests
- `npm run test:packages:data-schemas` - Run packages/data-schemas tests
- `npm run test:all` - Run all tests

**Run a single test file:**

```bash
cd client && npm run test:ci -- --testPathPattern="filename.spec.ts"
cd api && npm run test:ci -- --testPathPattern="filename.spec.js"
```

### E2E Tests (Playwright)

- `npm run e2e` - Run e2e tests headless
- `npm run e2e:headed` - Run e2e tests headed
- `npm run e2e:a11y` - Run accessibility tests
- `npm run e2e:ci` - Run e2e tests in CI mode
- `npm run e2e:debug` - Debug mode with Playwright inspector
- `npm run e2e:codegen` - Generate Playwright tests
- `npm run e2e:update` - Update e2e snapshots
- `npm run e2e:report` - Show e2e test report

## Linting and Formatting

- `npm run lint` - Run ESLint on all files
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Format all files with Prettier

## Code Style Guidelines

### General Rules

- Use **single quotes** for strings
- Use **trailing commas** (ES5 compatible)
- **Print width: 100**, **tab width: 2 spaces**
- Use **semicolons**
- Use arrow functions for callbacks and closures

### Imports

- Sort imports using `simple-import-sort` (auto-fixed by lint)
- Order: side-effect imports, then named imports from external packages, then internal aliases
- Use alias paths: `~/` for api files, `~/*` for client files
- Example: `import { useQuery } from '@tanstack/react-query';`

### TypeScript

- Enable strict mode but `@typescript-eslint/no-explicit-any` is allowed
- Use type inference where clear, explicit types for function signatures
- Prefix unused parameters with `_`: `function foo(_unused: string, used: number) {}`
- Use `zod` for runtime validation of external data

### React Components

- Use functional components with hooks
- Name components in **PascalCase**
- Place hooks at the top of components
- Extract large inline functions into named functions
- Use `React.FC` or explicit prop types (not both)

### Naming Conventions

- **Components**: PascalCase (`ChatView`, `MessageInput`)
- **Functions/variables**: camelCase (`getMessages`, `isLoading`)
- **Constants**: SCREAMING_SNAKE_CASE or camelCase for objects
- **Files**: lowercase with dashes for general files, camelCase for utilities

### Error Handling

- Use `try/catch` for async operations
- Always log errors with context: `logger.error('[Module] Error:', err)`
- Use the centralized error middleware in `api/server/middleware/error.js`
- Handle promise rejections: `.catch((err) => logger.error(...))`

### Internationalization

- **NEVER hardcode user-facing strings** - use `useTranslation()` or `t()` function
- All UI text must go through the i18n system
- ESLint rule `i18next/no-literal-string` will enforce this

### Backend (Express)

- Use `require` for CommonJS files, `import` for ES modules
- Controller functions receive `(req, res, next)` - handle async with try/catch
- Use `~` alias for relative imports from api root
- Models in `api/models/`, controllers in `api/server/`, services in `api/server/services/`

### Testing Guidelines

- Tests in `__tests__` or `*.spec.{ts,js}` files alongside source
- Use `describe()`, `it()`/`test()`, `expect()` from Jest
- Mock external services and database operations
- Test file: `utils.test.ts` for `utils.ts`

## Directory Structure

```
/                       # Root package.json (scripts, config)
├── api/                # Express backend
│   ├── models/         # In-memory models
│   ├── server/         # Express routes, controllers
│   ├── utils/          # Utility functions
│   └── middleware/     # Express middleware
├── client/             # React frontend (Vite)
│   ├── src/
│   │   ├── components/ # React components
│   │   ├── data-provider/ # React Query hooks
│   │   ├── store/      # State management (Recoil, Jotai)
│   │   └── utils/      # Client utilities
│   └── test/           # Jest setup
├── packages/           # Shared packages
│   ├── api/            # Shared API types/utilities
│   ├── client/         # Shared client utilities
│   ├── data-provider/  # Shared data types & hooks
│   └── data-schemas/   # Shared Zod schemas
├── e2e/                # Playwright e2e tests
└── config/             # Build/config scripts
```

## Common Patterns

### React Query Mutations

```typescript
const mutation = useMutation({
  mutationFn: createConversation,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: [QueryKeys.conversations] });
  },
});
```

### Express Error Handling

```javascript
try {
  const result = await someAsyncOperation();
  res.json(result);
} catch (err) {
  logger.error('[Operation] Error:', err);
  next(err); // Pass to error middleware
}
```

### Zod Schema Validation

```typescript
const CreateMessageSchema = z.object({
  conversationId: z.string(),
  text: z.string().min(1),
});
```

## Internal Container Registry

- **LibreChat**: `registry.jsc.fz-juelich.de/kaas/rke2-clusters/blablador/librechat`
- **RAG API**: `registry.jsc.fz-juelich.de/kaas/rke2-clusters/blablador/librechat-rag-api`
