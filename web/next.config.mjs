/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      "/api/generate": ["./node_modules/ffmpeg-static/ffmpeg"],
      "/api/opening-frames": ["./node_modules/ffmpeg-static/ffmpeg"],
    },
  },
};

export default nextConfig;
