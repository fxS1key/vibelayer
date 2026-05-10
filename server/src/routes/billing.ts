// POST /api/v1/billing/topup — Stripe Checkout session for token packs.
// Webhook handler is intentionally omitted here; wire it in a separate route
// when you set up Stripe in your deployment.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import Stripe from 'stripe';
import { requireAuth, type AuthedRequest } from '../lib/auth.js';

const TopupBody = z.object({
  pack: z.enum(['small', 'large']),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: '2024-06-20' }) : null;

  app.post('/billing/topup', { preHandler: requireAuth }, async (req, reply) => {
    if (!stripe) return reply.code(503).send({ error: 'billing_disabled' });
    const parsed = TopupBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const priceId =
      parsed.data.pack === 'small'
        ? process.env.STRIPE_PRICE_TOPUP_SMALL
        : process.env.STRIPE_PRICE_TOPUP_LARGE;
    if (!priceId) return reply.code(503).send({ error: 'price_not_configured' });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: parsed.data.successUrl,
      cancel_url: parsed.data.cancelUrl,
      client_reference_id: (req as AuthedRequest).userId,
    });

    return reply.send({ url: session.url });
  });
}
