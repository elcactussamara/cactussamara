// ============================================================
// Envoi d'emails via le Gmail de Cactus (SMTP + mot de passe d'application).
// Côté SERVEUR uniquement. Sans identifiants → mode simulation : l'email est
// affiché dans les logs du serveur au lieu d'être envoyé (voir .env.example).
// ============================================================
import nodemailer from 'nodemailer';
import { GMAIL_USER, GMAIL_APP_PASSWORD } from 'astro:env/server';

/** Boîte qui reçoit les demandes (affichée aussi dans le footer). */
export const CACTUS_EMAIL = 'elcactussamara2022@gmail.com';

export const isMailMock = !GMAIL_USER || !GMAIL_APP_PASSWORD;

const transport = isMailMock
  ? null
  : nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD!.replace(/\s/g, '') },
    });

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** « Répondre » dans Gmail écrit directement au client. */
  replyTo?: string;
};

export async function sendMail(mail: Mail) {
  if (!transport) {
    console.info(`[mail:simulation] To: ${mail.to} | Reply-To: ${mail.replyTo ?? '-'} | ${mail.subject}\n${mail.text}`);
    return { simulated: true };
  }
  await transport.sendMail({
    from: { name: 'Cactus website', address: GMAIL_USER! },
    ...mail,
  });
  return { simulated: false };
}

/** Échappe le texte saisi par le client avant de l'insérer dans le HTML de l'email. */
export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
