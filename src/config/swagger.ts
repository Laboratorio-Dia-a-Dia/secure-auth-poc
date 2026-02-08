import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Secure Auth Gateway API',
      version: '1.0.0',
      description: `
Sistema profissional de autenticação JWT com HttpOnly Cookies, Redis Blacklist e proteção CSRF.

## 🔐 Características de Segurança
- **HttpOnly Cookies**: Tokens armazenados de forma segura, inacessíveis via JavaScript
- **CSRF Protection**: Synchronizer Token Pattern
- **Rate Limiting**: Proteção contra brute-force e DoS
- **Automatic Token Rotation**: Refresh automático com grace period
- **Redis Blacklist**: Revogação imediata de tokens
- **Argon2id Hashing**: Algoritmo vencedor do Password Hashing Competition

## 🚀 Fluxos Implementados
1. **Registro** → POST /api/auth/register
2. **Login** → POST /api/auth/login → Set-Cookie (access_token + refresh_token)
3. **Refresh** → POST /api/auth/refresh → Automatic Rotation
4. **Logout** → POST /api/auth/logout → Blacklist + Clear Cookies
5. **Update Password** → PATCH /api/users/password → Revoke All Tokens
6. **CSRF Protection**:
      - O sistema utiliza **Synchronizer Token Pattern**.
      - O cliente deve ler o cookie \`csrf_token\` (não HttpOnly).
      - O valor deve ser enviado no header \`x-csrf-token\` em requisições de mutação (POST, PUT, PATCH, DELETE).
      - Em ambiente de teste (\`NODE_ENV=test\`), a validação é ignorada.
      `,
      contact: {
        name: 'API Support',
        email: 'support@example.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: env.API_URL || 'http://localhost:3000',
        description: env.NODE_ENV === 'production' ? 'Production' : 'Development',
      },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'access_token',
          description: 'Access token armazenado em cookie HttpOnly',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000' },
            email: { type: 'string', format: 'email', example: 'user@example.com' },
            name: { type: 'string', example: 'John Doe' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'error' },
            message: { type: 'string', example: 'Error message' },
            details: { type: 'object' },
          },
        },
      },
    },
    security: [
      {
        cookieAuth: [],
      },
    ],
  },
  apis: ['./src/modules/**/*.routes.ts', './src/modules/**/*.controller.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
