/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Disable TurboPack to avoid dev server issues
  //turbo: false,

  // Allow external devices to access the dev server
  allowedDevOrigins: [
    "http://192.168.2.254:3000",
    "http://localhost:3000",
    "https://dev.leighpogo.co.uk",
    "https://leighpogo.co.uk",
    "https://www.leighpogo.co.uk",
  ],
};

module.exports = nextConfig;
