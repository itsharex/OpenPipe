import nextRoutes from "nextjs-routes/config";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
const { env } = await import("./src/env.mjs");

/** @type {import("next").NextConfig} */
let config = {
  reactStrictMode: true,

  /**
   * If you have `experimental: { appDir: true }` set, then you must comment the below `i18n` config
   * out.
   *
   * @see https://github.com/vercel/next.js/issues/41980
   */
  i18n: {
    locales: ["en"],
    defaultLocale: "en",
  },

  rewrites: async () => [
    {
      source: "/ingest/:path*",
      destination: "https://app.posthog.com/:path*",
    },
  ],

  webpack: (config) => {
    config.module.rules.push({
      test: /\.txt$/,
      use: "raw-loader",
    });
    return config;
  },

  transpilePackages: ["openpipe"],
};

config = nextRoutes()(config);

if (env.NEXT_PUBLIC_SENTRY_DSN && env.SENTRY_AUTH_TOKEN) {
  // @ts-expect-error - `withSentryConfig` is not typed correctly
  config = withSentryConfig(
    config,
    {
      authToken: env.SENTRY_AUTH_TOKEN,
      silent: true,
      org: "openpipe",
      project: "openpipe",
    },
    {
      widenClientFileUpload: true,
      tunnelRoute: "/monitoring",
      disableLogger: true,
    },
  );
}

export default config;
