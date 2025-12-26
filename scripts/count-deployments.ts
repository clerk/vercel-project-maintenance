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
    try {
      const res = await vercel.teams.getTeams({
        limit,
        until,
      });
      const teams = res.teams || [];
      for (const t of teams) {
        if (t?.id) teamIds.push(t.id);
      }
      const next = res.pagination?.next as number | null | undefined;
      if (next == null) break;
      until = next;
    } catch (err) {
      if (err instanceof ResponseValidationError) {
        const raw: any = err.rawValue;
        const teams = raw?.teams;
        if (Array.isArray(teams)) {
          for (const t of teams) {
            if (t?.id) teamIds.push(t.id);
          }
          const next = raw?.pagination?.next as number | null | undefined;
          if (next == null) break;
          until = next;
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }
  }
  return teamIds;
}

async function countDeploymentsForTeam(vercel: Vercel, teamId: string) {
  let total = 0;
  let until: number | undefined = undefined;
  const limit = 100;
  for (;;) {
      const res = await vercel.deployments.getDeployments({
        teamId,
        limit,
        until,
      });
      total += res.deployments?.length ?? 0;
      const next = res.pagination?.next as number | null | undefined;
      if (next == null) break;
      until = next;
  }
  return total;
}

async function main(): Promise<void> {
  const vercel = new Vercel({ bearerToken: token });

  // All teams the token can access
  const teamIds = await listAllTeamIds(vercel);

  let teamsTotal = 0;
  for (const teamId of teamIds) {
    const c = await countDeploymentsForTeam(vercel, teamId);
    teamsTotal += c;
    console.log(`team=${teamId}\tdeployments=${c}`);
  }

  console.log(`total\tdeployments=${teamsTotal}`);
}

void main();


