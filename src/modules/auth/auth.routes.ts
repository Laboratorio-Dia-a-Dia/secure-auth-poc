import { Router } from 'express';
import { rateLimiter } from '@shared/middlewares/rateLimiter';
import { authController } from './auth.controller';

const router = Router();

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Registrar novo usuário
 *     description: Cria uma nova conta de usuário com email e senha
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: SecurePass123
 *               name:
 *                 type: string
 *                 example: John Doe
 *     responses:
 *       201:
 *         description: Usuário criado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       400:
 *         description: Email já cadastrado ou dados inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/register', rateLimiter.loginLimit(), authController.register.bind(authController));

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Fazer login
 *     description: Autentica usuário e retorna tokens via cookies HttpOnly
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: SecurePass123
 *               rememberMe:
 *                 type: boolean
 *                 default: false
 *                 description: Se true, refresh token expira em 30 dias (em vez de 7)
 *     responses:
 *       200:
 *         description: Login bem-sucedido
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *               example: access_token=...; HttpOnly; Secure; SameSite=Strict
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       401:
 *         description: Credenciais inválidas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/login', rateLimiter.loginLimit(), authController.login.bind(authController));

/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Renovar tokens
 *     description: Renova access_token usando refresh_token (Automatic Rotation)
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Tokens renovados com sucesso
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *       401:
 *         description: Refresh token inválido ou expirado / Reuse detectado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/refresh', authController.refresh.bind(authController));

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Fazer logout
 *     description: Revoga tokens (blacklist) e limpa cookies
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Logout realizado com sucesso
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *               example: access_token=; Max-Age=0
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *       401:
 *         description: Não autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/logout', authController.logout.bind(authController));

export { router as authRoutes };
