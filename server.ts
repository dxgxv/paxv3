import dotenv from "dotenv";
dotenv.config();

import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { EVIDENCIAS_DIR, inicializarDb } from "./server/db.ts";
import { createFleetRouter } from "./server/routes/fleet.ts";
import { createEmergenciesRouter } from "./server/routes/emergencies.ts";
import { createWorkshopRouter } from "./server/routes/workshop.ts";
import { createManagementRouter } from "./server/routes/management.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inicializar base de datos SQLite incremental al arrancar
inicializarDb(false);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "15mb" }));

  if (!fs.existsSync(EVIDENCIAS_DIR)) {
    fs.mkdirSync(EVIDENCIAS_DIR, { recursive: true });
  }
  app.use("/evidencias", express.static(EVIDENCIAS_DIR));

  // Routers por dominio bajo /api
  app.use("/api", createFleetRouter());
  app.use("/api", createEmergenciesRouter());
  app.use("/api", createWorkshopRouter());
  app.use("/api", createManagementRouter());

  // Vite middleware en dev / estáticos en prod
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      appType: "spa",
      plugins: [
        {
          name: "disable-vite-client-ws",
          enforce: "post",
          transform(code, id) {
            const cleanId = id.split("?")[0];
            if (cleanId.endsWith("/vite/dist/client/client.mjs")) {
              return code.replace(
                "transport.connect(createHMRHandler(handleMessage));",
                "/* WebSocket HMR disabled in middlewareMode */ transport.connect = async () => {}; transport.send = async () => {};"
              );
            }
          },
        },
      ],
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*all", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Rental Valdivia Server running on http://localhost:${PORT}`);
  });
}

startServer();
