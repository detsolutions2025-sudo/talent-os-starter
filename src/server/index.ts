import { createServer } from "./app";

const port = Number(process.env.PORT ?? 3001);
const app = createServer();

app.listen(port, () => {
  console.log(`Talent OS API listening on http://127.0.0.1:${port}`);
});
