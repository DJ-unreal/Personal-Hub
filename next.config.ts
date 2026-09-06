import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Emit .next/standalone — a self-contained server bundle with only the
     node_modules it actually needs. Keeps the Docker image small and means
     the runtime stage doesn't have to install dependencies. */
  output: "standalone",

  /* DEV ONLY. Next blocks cross-origin requests to dev assets (/_next/*,
     hot-reload) from anything other than localhost, so opening the dev
     server from another device serves the HTML but no JavaScript — the page
     just looks dead. Allow every host we legitimately reach this from.
     Has no effect on production builds.

       192.168.2.*                  home LAN (wildcard survives a new DHCP lease)
       100.101.100.120              this machine's Tailscale IP
       desktop-un9789t…ts.net       MagicDNS name, incl. the HTTPS origin
                                    created by `tailscale serve` */
  allowedDevOrigins: [
    "192.168.2.33",
    "192.168.2.*",
    "100.101.100.120",
    "desktop-un9789t",
    "desktop-un9789t.tail0d0c09.ts.net",
    "*.tail0d0c09.ts.net",
  ],
};

export default nextConfig;
