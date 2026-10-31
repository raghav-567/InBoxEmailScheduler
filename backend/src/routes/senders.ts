import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { createEtherealAccount } from '../config/smtp';
import prisma from '../config/database';

const router = Router();

router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // Ethereal occasionally hands back an account we've already stored for this
    // user, which trips the @@unique([email, userId]) constraint.  Retry with a
    // fresh account a few times before surfacing an error.
    let sender = null;
    for (let attempt = 0; attempt < 3 && !sender; attempt++) {
      const etherealAccount = await createEtherealAccount();
      try {
        sender = await prisma.sender.create({
          data: {
            email: etherealAccount.email,
            smtpHost: etherealAccount.host,
            smtpPort: etherealAccount.port,
            smtpUser: etherealAccount.user,
            smtpPass: etherealAccount.pass,
            userId,
          },
        });
      } catch (err: any) {
        if (err.code === 'P2002') continue; // duplicate account, try another
        throw err;
      }
    }

    if (!sender) {
      res.status(409).json({ error: 'Could not provision a unique Ethereal sender, please try again' });
      return;
    }

    res.status(201).json({
      message: 'Sender created with Ethereal Email account',
      sender: {
        id: sender.id,
        email: sender.email,
        smtpUser: sender.smtpUser,
        smtpHost: sender.smtpHost,
        smtpPort: sender.smtpPort,
        createdAt: sender.createdAt,
      },
    });
  } catch (error: any) {
    console.error('Create sender error:', error);
    res.status(500).json({ error: 'Failed to create sender' });
  }
});

router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const senders = await prisma.sender.findMany({
      where: { userId },
      select: {
        id: true,
        email: true,
        smtpUser: true,
        smtpHost: true,
        smtpPort: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ senders });
  } catch (error: any) {
    console.error('List senders error:', error);
    res.status(500).json({ error: 'Failed to fetch senders' });
  }
});

router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const senderId = req.params.id;

    const sender = await prisma.sender.findFirst({
      where: { id: senderId, userId },
    });

    if (!sender) {
      res.status(404).json({ error: 'Sender not found' });
      return;
    }

    const activeJobs = await prisma.emailJob.count({
      where: {
        senderId,
        status: { in: ['SCHEDULED', 'QUEUED', 'SENDING'] },
      },
    });

    if (activeJobs > 0) {
      res.status(400).json({
        error: `Cannot delete sender with ${activeJobs} active email job(s). Wait for them to complete or cancel them first.`,
      });
      return;
    }

    await prisma.sender.delete({
      where: { id: senderId },
    });

    res.json({ message: 'Sender deleted successfully' });
  } catch (error: any) {
    console.error('Delete sender error:', error);
    res.status(500).json({ error: 'Failed to delete sender' });
  }
});

export default router;
