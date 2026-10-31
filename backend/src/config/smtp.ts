import nodemailer from 'nodemailer';
import config from './index';

export function createTransporter(
  smtpUser?: string,
  smtpPass?: string,
  smtpHost?: string,
  smtpPort?: number
): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: smtpHost || config.SMTP_HOST,
    port: smtpPort || config.SMTP_PORT,
    secure: false,
    auth: {
      user: smtpUser || config.SMTP_USER,
      pass: smtpPass || config.SMTP_PASS,
    },
  });
}

export function getDefaultTransporter(): nodemailer.Transporter {
  return createTransporter(config.SMTP_USER, config.SMTP_PASS, config.SMTP_HOST, config.SMTP_PORT);
}

export async function createEtherealAccount(): Promise<{
  user: string;
  pass: string;
  email: string;
  host: string;
  port: number;
}> {
  const testAccount = await nodemailer.createTestAccount();
  return {
    user: testAccount.user,
    pass: testAccount.pass,
    email: testAccount.user,
    host: 'smtp.ethereal.email',
    port: 587,
  };
}
