/**
 * utils/paypalClient.js
 *
 * PayPal REST API (Orders v2) client, built on the official
 * @paypal/checkout-server-sdk. Credentials are never hardcoded — always
 * read from environment variables (see backend/.env.example).
 *
 * PAYPAL_ENV controls which PayPal environment is used:
 *   - unset or "sandbox" (default): PayPal Sandbox — no real money moves.
 *   - "live": real PayPal — nothing in this codebase sets this by default.
 */

const checkoutNodeJssdk = require("@paypal/checkout-server-sdk");

function environment() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "PayPal is not configured — set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in backend/.env",
    );
  }

  return process.env.PAYPAL_ENV === "live"
    ? new checkoutNodeJssdk.core.LiveEnvironment(clientId, clientSecret)
    : new checkoutNodeJssdk.core.SandboxEnvironment(clientId, clientSecret);
}

function getClient() {
  return new checkoutNodeJssdk.core.PayPalHttpClient(environment());
}

module.exports = { getClient, paypal: checkoutNodeJssdk };
