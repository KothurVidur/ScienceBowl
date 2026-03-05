const dns = require('dns').promises;

/**
 * Strict syntax guard (still not enough on its own for real deliverability).
 */
const STRICT_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Small in-memory DNS cache to avoid repeated resolver latency.
 * Cache key: lowercased domain
 */
const DOMAIN_CACHE_TTL_MS = 10 * 60 * 1000;
const domainDeliverabilityCache = new Map();

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const hasFreshCache = (domain) => {
  const cached = domainDeliverabilityCache.get(domain);
  return Boolean(cached && (Date.now() - cached.checkedAt) < DOMAIN_CACHE_TTL_MS);
};

const isEmailSyntaxValid = (email) => STRICT_EMAIL_REGEX.test(normalizeEmail(email));

/**
 * "Real email" practical check:
 * 1) valid syntax
 * 2) domain resolves for mail (MX), or at least has A/AAAA fallback
 *
 * Note: This validates domain deliverability, not mailbox existence.
 */
const isEmailDeliverable = async (email) => {
  const normalized = normalizeEmail(email);
  if (!isEmailSyntaxValid(normalized)) return false;

  const domain = normalized.split('@')[1];
  if (!domain) return false;

  if (hasFreshCache(domain)) {
    return Boolean(domainDeliverabilityCache.get(domain)?.deliverable);
  }

  let deliverable = false;

  try {
    const mxRecords = await dns.resolveMx(domain);
    if (Array.isArray(mxRecords) && mxRecords.length > 0) {
      deliverable = true;
    }
  } catch {
    // Fall through to A/AAAA fallback.
  }

  if (!deliverable) {
    try {
      const [aRecords, aaaaRecords] = await Promise.allSettled([
        dns.resolve4(domain),
        dns.resolve6(domain)
      ]);

      const hasA = aRecords.status === 'fulfilled' && Array.isArray(aRecords.value) && aRecords.value.length > 0;
      const hasAAAA = aaaaRecords.status === 'fulfilled' && Array.isArray(aaaaRecords.value) && aaaaRecords.value.length > 0;
      deliverable = hasA || hasAAAA;
    } catch {
      deliverable = false;
    }
  }

  domainDeliverabilityCache.set(domain, {
    deliverable,
    checkedAt: Date.now()
  });

  return deliverable;
};

module.exports = {
  normalizeEmail,
  isEmailSyntaxValid,
  isEmailDeliverable
};

