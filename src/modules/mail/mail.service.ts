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
    // const permissionLabel = permission === 'editor' ? 'edit' : 'view';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <!-- Header -->
                <tr>
                  <td style="background-color: #42A5F5; padding: 32px 40px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600; letter-spacing: -0.5px;">DB Flow</h1>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 24px; font-weight: 600;">Project Invitation</h2>
                    <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                      <strong>${inviterName}</strong> has invited you to collaborate on the project <strong>"${projectName}"</strong>.
                    </p>
                    <p style="color: #6B7280; font-size: 14px; margin: 0 0 24px 0;">
                      Permission level: <strong style="color: #42A5F5;">${permission === 'editor' ? 'Editor' : 'Viewer'}</strong>
                    </p>
                    ${
                      message
                        ? `<div style="background-color: #F9FAFB; border-left: 3px solid #42A5F5; padding: 16px; margin: 0 0 24px 0;">
                            <p style="color: #6B7280; margin: 0 0 8px 0; font-size: 13px; font-weight: 500;">Message:</p>
                            <p style="color: #111827; margin: 0; font-size: 14px; line-height: 1.5;">${message}</p>
                          </div>`
                        : ''
                    }
                    <table cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                      <tr>
                        <td style="background-color: #42A5F5; border-radius: 6px;">
                          <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/accept-invite?token=${token}" 
                             style="display: inline-block; color: #ffffff; padding: 14px 32px; text-decoration: none; font-weight: 600; font-size: 15px;">
                            Accept Invitation
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="color: #6B7280; font-size: 13px; line-height: 1.5; margin: 24px 0 0 0;">
                      If you don't want to accept this invitation, you can ignore this email.
                    </p>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background-color: #F9FAFB; padding: 24px 40px; border-top: 1px solid #E5E7EB;">
                    <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin: 0;">
                      © ${new Date().getFullYear()} DB Flow. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
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

  async sendWorkspaceInvitationEmail(
    to: string,
    workspaceName: string,
    token: string,
  ): Promise<void> {
    const acceptUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/accept-workspace-invite?token=${encodeURIComponent(token)}`;
    const safeWorkspaceName = this.escapeHtml(workspaceName);
    try {
      await this.transporter.sendMail({
        from: `"DBFlow" <${process.env.MAIL_USER}>`,
        to,
        subject: `You were invited to "${workspaceName}" on DBFlow`,
        html: `
          <div style="font-family: Arial, sans-serif; color: #111827">
            <h2>Workspace invitation</h2>
            <p>You were invited to join <strong>${safeWorkspaceName}</strong> on DBFlow.</p>
            <p>
              <a href="${acceptUrl}" style="display:inline-block;padding:12px 20px;background:#42A5F5;color:#fff;text-decoration:none;border-radius:6px">
                Accept invitation
              </a>
            </p>
            <p>This invitation expires in 7 days.</p>
          </div>
        `,
      });
      this.logger.log(`Workspace invitation email sent to ${to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send workspace invitation email to ${to}`,
        error,
      );
    }
  }

  async sendRenewalBillEmail(input: {
    to: string;
    recipientName: string;
    workspaceName: string;
    planName: string;
    amount: string;
    currency: string;
    expiresAt: Date;
    checkoutUrl: string;
  }): Promise<void> {
    const recipientName = this.escapeHtml(input.recipientName || 'there');
    const workspaceName = this.escapeHtml(input.workspaceName);
    const planName = this.escapeHtml(input.planName);
    const amount = this.escapeHtml(
      `${Number(input.amount).toLocaleString('vi-VN')} ${input.currency}`,
    );
    const checkoutUrl = this.escapeHtml(input.checkoutUrl);
    try {
      await this.transporter.sendMail({
        from: `"DBFlow" <${process.env.MAIL_USER}>`,
        to: input.to,
        subject: `Renewal bill for "${input.workspaceName}"`,
        html: `
          <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.6">
            <h2>Subscription renewal bill</h2>
            <p>Hi ${recipientName},</p>
            <p>A renewal bill has been created for workspace <strong>${workspaceName}</strong>.</p>
            <p>
              Plan: <strong>${planName}</strong><br />
              Amount: <strong>${amount}</strong><br />
              Payment due: <strong>${input.expiresAt.toLocaleString('vi-VN', {
                timeZone: 'Asia/Ho_Chi_Minh',
              })}</strong>
            </p>
            <p>
              <a href="${checkoutUrl}" style="display:inline-block;padding:12px 20px;background:#42A5F5;color:#fff;text-decoration:none;border-radius:6px">
                Pay renewal bill
              </a>
            </p>
            <p>If this bill is not paid by the due date, it will be canceled and the subscription will not renew.</p>
          </div>
        `,
      });
      this.logger.log(`Renewal bill email sent to ${input.to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send renewal bill email to ${input.to}`,
        error,
      );
    }
  }

  private escapeHtml(value: string): string {
    return value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;',
        })[character]!,
    );
  }
}
