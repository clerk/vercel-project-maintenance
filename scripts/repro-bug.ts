import "dotenv/config";
import { Vercel } from "@vercel/sdk";

const token: string | undefined = process.env.VERCEL_TOKEN;
if (!token) {
  console.error("Missing VERCEL_TOKEN in .env");
  process.exit(1);
}

const envTeamId: string | undefined = process.env.VERCEL_TEAM_ID || undefined;
if (!envTeamId) {
  console.error("Missing VERCEL_TEAM_ID in .env");
  process.exit(1);
}

async function main(): Promise<void> {
  const vercel = new Vercel({ bearerToken: token });
  await vercel.projects.getProjects({ teamId: envTeamId, limit: "3" });
}

void main();
