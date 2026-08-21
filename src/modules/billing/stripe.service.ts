import { BadGatewayException, Injectable } from '@nestjs/common';
import Stripe = require('stripe');

@Injectable()
export class StripeService {
  private client?: Stripe;

  get stripe() {
    if (!this.client) {
      const secretKey = this.requiredEnv('STRIPE_SECRET_KEY');
      this.client = new Stripe(secretKey);
    }
    return this.client;
  }

  constructWebhookEvent(rawBody: Buffer, signature: string) {
    try {
      return this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.requiredEnv('STRIPE_WEBHOOK_SECRET'),
      );
    } catch {
      throw new BadGatewayException('Invalid Stripe webhook signature');
    }
  }

  private requiredEnv(name: string) {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required`);
    return value;
  }
}
