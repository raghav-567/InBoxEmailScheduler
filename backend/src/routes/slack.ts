import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getAuthUrl,
  handleCallback,
  consumeOAuthState,
  disconnect,
  getStatus,
} from '../services/slackService';
import config from '../config';

const router = Router();

router.get('/connect', authenticateToken, async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const authUrl = await getAuthUrl(userId);
  // The frontend calls this over XHR so it can send the JWT in the
  // Authorization header. Return the URL instead of redirecting: a plain
  // browser navigation cannot attach that header and would 401.
  res.json({ authUrl });
});

router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      res.status(400).json({ error: 'Missing code or state parameter' });
      return;
    }

    // Resolve the user from the signed-at-issue-time state nonce, not from the
    // URL directly — prevents binding a webhook to an arbitrary account.
    const userId = await consumeOAuthState(state as string);
    if (!userId) {
      res.redirect(`${config.FRONTEND_URL}/dashboard?slack=error&message=${encodeURIComponent('Invalid or expired OAuth state')}`);
      return;
    }

    await handleCallback(code as string, userId);

    res.redirect(`${config.FRONTEND_URL}/dashboard?slack=connected`);
  } catch (error: any) {
    console.error('Slack callback error:', error);
    res.redirect(`${config.FRONTEND_URL}/dashboard?slack=error&message=${encodeURIComponent(error.message)}`);
  }
});

router.post('/disconnect', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    await disconnect(userId);
    res.json({ message: 'Slack disconnected successfully' });
  } catch (error: any) {
    console.error('Slack disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect Slack' });
  }
});

router.get('/status', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const status = await getStatus(userId);
    res.json(status);
  } catch (error: any) {
    console.error('Slack status error:', error);
    res.status(500).json({ error: 'Failed to get Slack status' });
  }
});

export default router;
