import "dotenv/config";
import { Vercel } from "@vercel/sdk";
import { ResponseValidationError } from "@vercel/sdk/models/responsevalidationerror.js";

const token: string | undefined = process.env.VERCEL_TOKEN;
if (!token) {
  console.error("Missing VERCEL_TOKEN in .env");
  process.exit(1);
}

async function listAllTeamIds(vercel: Vercel): Promise<string[]> {
  const teamIds: string[] = [];
  let until: number | undefined = undefined;
  const limit = 100;
  for (;;) {
    const res = await vercel.teams.getTeams({
      limit,
      until,
    });
    const teams = res.teams || [];
    for (const t of teams) {
      if (t?.id) teamIds.push(t.id);
    }
    const next = res.pagination?.next;
    if (next == null) break;
    until = next;
  }
  return teamIds;
}

type EnvCounts = Record<string, number>;

function envFromTarget(target: string | null | undefined): string {
  if (target == null) return "preview";
  return target;
}

function addCounts(into: EnvCounts, from: EnvCounts): void {
  for (const [env, n] of Object.entries(from)) {
    into[env] = (into[env] ?? 0) + n;
  }
}

async function countDeploymentsForTeam(
  vercel: Vercel,
  teamId: string,
): Promise<EnvCounts> {
  const counts: EnvCounts = {};
  let until: number | undefined = undefined;
  const limit = 100;
  for (;;) {
    const res = await vercel.deployments.getDeployments({
      teamId,
      limit,
      until,
    });
    for (const d of res.deployments ?? []) {
      const env = envFromTarget(d.target);
      counts[env] = (counts[env] ?? 0) + 1;
    }
    const next = res.pagination?.next;
    if (next == null) break;
    until = next;
  }
  return counts;
}

function formatCounts(counts: EnvCounts): string {
  const known = ["production", "preview"];
  const parts = known.map((env) => `${env}=${counts[env] ?? 0}`);
  for (const [env, n] of Object.entries(counts)) {
    if (!known.includes(env)) parts.push(`${env}=${n}`);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  parts.push(`total=${total}`);
  return parts.join("\t");
}

async function main(): Promise<void> {
  const vercel = new Vercel({ bearerToken: token });

  // All teams the token can access
  const teamIds = await listAllTeamIds(vercel);

  const grandTotals: EnvCounts = {};
  for (const teamId of teamIds) {
    const counts = await countDeploymentsForTeam(vercel, teamId);
    addCounts(grandTotals, counts);
    console.log(`team=${teamId}\t${formatCounts(counts)}`);
  }

  console.log(`total\t${formatCounts(grandTotals)}`);
}

void main();
