/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Disable TurboPack to avoid dev server issues
  //turbo: false,

  // Allow external devices to access the dev server
  allowedDevOrigins: [
    "http://192.168.2.254:3000",
    "http://localhost:3000",
  ],
};

module.exports = nextConfig;
