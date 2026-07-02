/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@cura/ui", "@cura/shared"],
  reactStrictMode: true,
  webpack: (config) => {
    // The shared libs are ESM TypeScript that import sibling modules with a `.js`
    // specifier (NodeNext style). Map `.js` → TS source so webpack resolves the
    // `@cura/ui`/`@cura/shared` barrels without a build step.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
