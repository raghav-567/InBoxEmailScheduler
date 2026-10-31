import { Router, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy, Profile } from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';
import config from '../config';
import prisma from '../config/database';
import { authenticateToken } from '../middleware/auth';
import { AuthUser } from '../types';

const router = Router();

passport.use(
  new GoogleStrategy(
    {
      clientID: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
      callbackURL: config.GOOGLE_CALLBACK_URL,
    },
    async (
      accessToken: string,
      refreshToken: string,
      profile: Profile,
      done: (error: any, user?: any) => void
    ) => {
      try {
        const email = profile.emails?.[0]?.value || '';
        const name = profile.displayName || '';
        const avatar = profile.photos?.[0]?.value || null;

        let user = await prisma.user.findUnique({
          where: { googleId: profile.id },
        });

        if (!user) {
          user = await prisma.user.create({
            data: {
              googleId: profile.id,
              email,
              name,
              avatar,
            },
          });
        } else {
          user = await prisma.user.update({
            where: { googleId: profile.id },
            data: { name, avatar },
          });
        }

        done(null, {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar ?? undefined,
        } satisfies AuthUser);
      } catch (error) {
        done(error);
      }
    }
  )
);

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(
      null,
      user
        ? {
            id: user.id,
            email: user.email,
            name: user.name,
            avatar: user.avatar ?? undefined,
          }
        : null
    );
  } catch (error) {
    done(error);
  }
});

router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
  })
);

router.get('/google/callback', (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('google', { session: false }, (error: Error | null, user?: AuthUser) => {
    if (error) {
      // Provider errors (for example, an invalid client secret) must not reach
      // the generic Express 500 handler or leak implementation details.
      console.error('Google OAuth callback failed:', error.message);
      res.redirect(`${config.FRONTEND_URL}/login?error=google_auth_failed`);
      return;
    }

    if (!user) {
      res.redirect(`${config.FRONTEND_URL}/login?error=google_auth_denied`);
      return;
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      },
      config.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.redirect(`${config.FRONTEND_URL}/auth/callback?token=${token}`);
  })(req, res, next);
});

router.get('/login-failed', (_req: Request, res: Response) => {
  res.status(401).json({ error: 'Google authentication failed' });
});

router.get('/me', authenticateToken, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

router.post('/logout', authenticateToken, (_req: Request, res: Response) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

export default router;
