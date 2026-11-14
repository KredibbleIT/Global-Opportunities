import { env } from '../config/env.js';
import { ApiError } from '../utils/http.js';

export const fetchWithTimeout = async (url, options = {}, service = 'Upstream service') => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.outboundRequestTimeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    // 503 (not 504, which Cloudflare replaces with its own page) and a message users can read (GOD-T66).
    if (error.name === 'AbortError') throw new ApiError(503, `${service} did not answer in time. Please try again.`, { expose: true });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};