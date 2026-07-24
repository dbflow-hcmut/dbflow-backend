import { BadGatewayException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

export interface PayOSWebhook {
  code: string;
  desc: string;
  success: boolean;
  data: Record<string, unknown> & {
    orderCode: number;
    amount: number;
    currency: string;
    paymentLinkId: string;
    reference: string;
  };
  signature: string;
}

export interface PayOSPaymentLink {
  id: string;
  orderCode: number;
  amount: number;
  status: 'PENDING' | 'PROCESSING' | 'PAID' | 'CANCELLED';
}

@Injectable()
export class PayOSService {
  private readonly baseUrl = 'https://api-merchant.payos.vn';

  async createPaymentLink(input: {
    orderCode: number;
    amount: number;
    description: string;
    cancelUrl: string;
    returnUrl: string;
    itemName: string;
    expiresAt?: Date;
  }) {
    const body = {
      orderCode: input.orderCode,
      amount: input.amount,
      description: input.description,
      items: [{ name: input.itemName, quantity: 1, price: input.amount }],
      cancelUrl: input.cancelUrl,
      returnUrl: input.returnUrl,
      expiredAt: Math.floor(
        (input.expiresAt?.getTime() ?? Date.now() + 30 * 60 * 1000) / 1000,
      ),
      signature: this.signCheckout(input),
    };
    const response = await fetch(`${this.baseUrl}/v2/payment-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': this.requiredEnv('PAYOS_CLIENT_ID'),
        'x-api-key': this.requiredEnv('PAYOS_API_KEY'),
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as {
      code?: string;
      desc?: string;
      data?: {
        paymentLinkId: string;
        checkoutUrl: string;
        status: string;
      };
    };
    if (!response.ok || payload.code !== '00' || !payload.data) {
      throw new BadGatewayException(
        `PayOS create payment link failed: ${payload.desc || response.statusText}`,
      );
    }
    return payload.data;
  }

  async getPaymentLink(id: string | number): Promise<PayOSPaymentLink> {
    const response = await fetch(
      `${this.baseUrl}/v2/payment-requests/${encodeURIComponent(id)}`,
      {
        headers: {
          'x-client-id': this.requiredEnv('PAYOS_CLIENT_ID'),
          'x-api-key': this.requiredEnv('PAYOS_API_KEY'),
        },
      },
    );
    const payload = (await response.json()) as {
      code?: string;
      desc?: string;
      data?: PayOSPaymentLink;
    };
    if (!response.ok || payload.code !== '00' || !payload.data) {
      throw new BadGatewayException(
        `PayOS get payment link failed: ${payload.desc || response.statusText}`,
      );
    }
    return payload.data;
  }

  verifyWebhook(payload: PayOSWebhook) {
    const expected = this.signData(payload.data);
    const actual = payload.signature.toLowerCase();
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(actual, 'hex'),
    );
  }

  private signCheckout(input: {
    orderCode: number;
    amount: number;
    description: string;
    cancelUrl: string;
    returnUrl: string;
  }) {
    return this.hmac(
      `amount=${input.amount}&cancelUrl=${input.cancelUrl}&description=${input.description}&orderCode=${input.orderCode}&returnUrl=${input.returnUrl}`,
    );
  }

  private signData(data: Record<string, unknown>) {
    const value = Object.keys(data)
      .sort()
      .map((key) => {
        const current = data[key];
        if (current === null || current === undefined) return `${key}=`;
        return `${key}=${this.stringifySignatureValue(current)}`;
      })
      .join('&');
    return this.hmac(value);
  }

  private stringifySignatureValue(value: unknown): string {
    if (Array.isArray(value)) {
      return JSON.stringify(
        value.map((item: unknown) =>
          this.isRecord(item)
            ? Object.fromEntries(
                Object.keys(item)
                  .sort()
                  .map((key) => [key, item[key]]),
              )
            : item,
        ),
      );
    }
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }
    return JSON.stringify(value) ?? '';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private hmac(value: string) {
    return crypto
      .createHmac('sha256', this.requiredEnv('PAYOS_CHECKSUM_KEY'))
      .update(value)
      .digest('hex');
  }

  private requiredEnv(name: string) {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required`);
    return value;
  }
}
