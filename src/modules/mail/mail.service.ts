import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD,
      },
    });
  }

  async sendInvitationEmail(
    to: string,
    inviterName: string,
    projectName: string,
    permission: string,
    token: string,
    message?: string,
  ): Promise<void> {
    const permissionLabel = permission === 'editor' ? 'edit' : 'view';

    const htmlContent = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 32px; margin-bottom: 24px;">
          <h1 style="color: white; margin: 0; font-size: 24px;">DBFlow</h1>
        </div>
        <div style="background: #f9fafb; border-radius: 12px; padding: 24px; border: 1px solid #e5e7eb;">
          <h2 style="color: #1f2937; margin-top: 0;">You've been invited!</h2>
          <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
            <strong>${inviterName}</strong> has invited you to <strong>${permissionLabel}</strong> 
            the project <strong>"${projectName}"</strong> on DBFlow.
          </p>
          ${
            message
              ? `<div style="background: white; border-left: 4px solid #667eea; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
                  <p style="color: #6b7280; margin: 0 0 4px 0; font-size: 12px;">Message from ${inviterName}:</p>
                  <p style="color: #374151; margin: 0; font-style: italic;">"${message}"</p>
                </div>`
              : ''
          }
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/accept-invite?token=${token}" 
             style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 16px;">
            Accept Invitation
          </a>
        </div>
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 24px;">
          This email was sent by DBFlow. If you didn't expect this, you can ignore it.
        </p>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: `"DBFlow" <${process.env.MAIL_USER}>`,
        to,
        subject: `${inviterName} invited you to "${projectName}" on DBFlow`,
        html: htmlContent,
      });
      this.logger.log(`Invitation email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send invitation email to ${to}`, error);
    }
  }
}
