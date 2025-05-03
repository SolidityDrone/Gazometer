/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config) => {
        config.resolve.fallback = { fs: false, path: false };
        // Add parent directory to module resolution
        config.resolve.modules = [...config.resolve.modules, '..'];
        return config;
    },
    // Use serverExternalPackages instead of experimental.serverComponentsExternalPackages
    serverExternalPackages: ['@noir-lang/noir_js', '@aztec/bb.js'],
    // Remove transpilePackages as it conflicts with serverExternalPackages
    // Remove resolve.alias as it's not a valid Next.js config option
};

module.exports = nextConfig; 