import { env, assertSafeRuntimeConfig } from "./config/env.js";
import { createApp } from "./app.js";

assertSafeRuntimeConfig();

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`e-GP Trust Layer backend listening on http://localhost:${env.PORT}`);
});
