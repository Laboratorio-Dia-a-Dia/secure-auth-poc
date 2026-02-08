import type { Request, Response, NextFunction } from 'express';
import { env } from '@config/env';
import { authService } from './auth.service';
import { registerSchema, loginSchema } from './auth.schema';

export class AuthController {
  /**
   * @swagger
   * /api/auth/register:
   *   post:
   *     summary: Register a new user
   *     tags: [Authentication]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [email, password, name]
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *                 example: user@example.com
   *               password:
   *                 type: string
   *                 minLength: 8
   *                 example: SecurePass123
   *               name:
   *                 type: string
   *                 example: John Doe
   *     responses:
   *       201:
   *         description: User registered successfully
   *       409:
   *         description: Email already in use
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedData = registerSchema.parse(req.body);
      const user = await authService.register(validatedData);

      res.status(201).json({
        status: 'success',
        message: 'User registered successfully',
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @swagger
   * /api/auth/login:
   *   post:
   *     summary: Authenticate user and receive HttpOnly cookies
   *     tags: [Authentication]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [email, password]
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *               password:
   *                 type: string
   *               rememberMe:
   *                 type: boolean
   *                 default: false
   *     responses:
   *       200:
   *         description: Login successful, cookies set
   *         headers:
   *           Set-Cookie:
   *             schema:
   *               type: string
   *       401:
   *         description: Invalid credentials
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedData = loginSchema.parse(req.body);
      const result = await authService.login(validatedData);

      // Define cookies HttpOnly
      const cookieOptions = {
        httpOnly: true,
        secure: env.COOKIE_SECURE,
        sameSite: env.COOKIE_SAME_SITE as 'strict' | 'lax' | 'none',
        domain: env.COOKIE_DOMAIN,
        path: '/',
      };

      // Access Token (15 minutos)
      res.cookie('access_token', result.accessToken, {
        ...cookieOptions,
        maxAge: 15 * 60 * 1000,
      });

      // Refresh Token (path restrito)
      const refreshMaxAge = result.rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;

      res.cookie('refresh_token', result.refreshToken, {
        ...cookieOptions,
        maxAge: refreshMaxAge,
        path: '/api/auth/refresh',
      });

      res.status(200).json({
        status: 'success',
        message: 'Login successful',
        data: {
          user: result.user,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @swagger
   * /api/auth/refresh:
   *   post:
   *     summary: Refresh access token using refresh token (Automatic Rotation)
   *     tags: [Authentication]
   *     security:
   *       - cookieAuth: []
   *     responses:
   *       200:
   *         description: Tokens refreshed successfully
   *       401:
   *         description: Invalid or expired refresh token
   */
  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken = req.cookies['refresh_token'] as string | undefined;

      if (!refreshToken) {
        res.status(401).json({
          status: 'error',
          message: 'Refresh token not found',
        });
        return;
      }

      const result = await authService.refresh(refreshToken);

      // Atualiza os cookies
      const cookieOptions = {
        httpOnly: true,
        secure: env.COOKIE_SECURE,
        sameSite: env.COOKIE_SAME_SITE as 'strict' | 'lax' | 'none',
        domain: env.COOKIE_DOMAIN,
        path: '/',
      };

      res.cookie('access_token', result.accessToken, {
        ...cookieOptions,
        maxAge: 15 * 60 * 1000,
      });

      res.cookie('refresh_token', result.refreshToken, {
        ...cookieOptions,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/api/auth/refresh',
      });

      res.status(200).json({
        status: 'success',
        message: 'Tokens refreshed successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @swagger
   * /api/auth/logout:
   *   post:
   *     summary: Logout user and invalidate all tokens
   *     tags: [Authentication]
   *     security:
   *       - cookieAuth: []
   *     responses:
   *       200:
   *         description: Logout successful, cookies cleared
   */
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const accessToken = req.cookies['access_token'] as string | undefined;
      const refreshToken = req.cookies['refresh_token'] as string | undefined;

      if (accessToken) {
        await authService.logout(accessToken, refreshToken);
      }

      // Limpa os cookies
      res.clearCookie('access_token', { path: '/' });
      res.clearCookie('refresh_token', { path: '/api/auth/refresh' });

      res.status(200).json({
        status: 'success',
        message: 'Logout successful',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
