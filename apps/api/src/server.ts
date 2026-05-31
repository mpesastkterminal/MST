import path from "node:path";

import dotenv from "dotenv";

import { createApp } from "./app";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

app.listen(port, () => {
  console.log(`MST API listening on http://localhost:${port}`);
});
