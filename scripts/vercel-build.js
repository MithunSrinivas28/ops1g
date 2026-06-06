// scripts/vercel-build.js
// Post-build script that transforms the Vite SSR output (dist/)
// into Vercel Build Output API v3 structure (.vercel/output/)
import { mkdirSync, cpSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const output = join(root, ".vercel", "output");

// 1. Create output directory structure
mkdirSync(join(output, "static"), { recursive: true });
mkdirSync(join(output, "functions", "index.func"), { recursive: true });

// 2. Write Build Output API config
writeFileSync(
  join(output, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        // Serve static client assets directly
        { src: "/assets/(.*)", dest: "/assets/$1" },
        // Everything else goes to the serverless function
        { handle: "filesystem" },
        { src: "/(.*)", dest: "/index" },
      ],
    },
    null,
    2
  )
);

// 3. Copy client assets to static/
cpSync(join(root, "dist", "client", "assets"), join(output, "static", "assets"), {
  recursive: true,
});

// 4. Create the serverless function
const funcConfig = {
  runtime: "nodejs22.x",
  handler: "index.mjs",
  launcherType: "Nodejs",
};

writeFileSync(
  join(output, "functions", "index.func", ".vc-config.json"),
  JSON.stringify(funcConfig, null, 2)
);

// 5. Create the function entry point that adapts fetch() to Vercel's Node.js interface
const entryCode = `
import { Readable } from "node:stream";

// Import the TanStack Start server — it exports a default with a fetch() method
const serverModule = await import("./server/server.js");
const app = serverModule.default;

export default async function handler(req, res) {
  try {
    // Build a standard Request from Node.js IncomingMessage
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
    const url = new URL(req.url, \`\${protocol}://\${host}\`);

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          for (const v of value) headers.append(key, v);
        } else {
          headers.set(key, value);
        }
      }
    }

    const init = {
      method: req.method,
      headers,
    };

    // Only attach body for non-GET/HEAD methods
    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = Readable.toWeb(req);
      init.duplex = "half";
    }

    const request = new Request(url.toString(), init);

    // Call TanStack Start's fetch handler
    const response = await app.fetch(request);

    // Write response status and headers
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") {
        responseHeaders[key] = responseHeaders[key]
          ? [...(Array.isArray(responseHeaders[key]) ? responseHeaders[key] : [responseHeaders[key]]), value]
          : value;
      } else {
        responseHeaders[key] = value;
      }
    });

    res.writeHead(response.status, responseHeaders);

    // Stream the response body
    if (response.body) {
      const reader = response.body.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            return;
          }
          res.write(value);
        }
      };
      await pump();
    } else {
      res.end();
    }
  } catch (error) {
    console.error("Serverless function error:", error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain" });
    }
    res.end("Internal Server Error");
  }
}
`;

writeFileSync(join(output, "functions", "index.func", "index.mjs"), entryCode);

// 6. Copy the entire server build into the function directory
cpSync(join(root, "dist", "server"), join(output, "functions", "index.func", "server"), {
  recursive: true,
});

// 7. Copy client assets into the function's server directory so the SSR
//    renderer can resolve manifest references to client chunks
const clientAssetsSource = join(root, "dist", "client", "assets");
const clientAssetsDest = join(output, "functions", "index.func", "server", "client-assets");
if (existsSync(clientAssetsSource)) {
  mkdirSync(clientAssetsDest, { recursive: true });
  cpSync(clientAssetsSource, clientAssetsDest, { recursive: true });
}

console.log("✓ Vercel Build Output API v3 structure created at .vercel/output/");
