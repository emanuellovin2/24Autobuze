import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // În directorul home există un package-lock.json care ar face Turbopack să creadă
  // că rădăcina proiectului e /Users/... — fixăm rădăcina explicit.
  turbopack: { root: path.resolve('.') },
};

export default nextConfig;
