import "dotenv/config";
import fs from "fs";
import { Vercel } from "@vercel/sdk";
import {
  GetProjectsProjects,
  GetProjectsResponseBody,
} from "@vercel/sdk/models/getprojectsop.js";
import { ResponseValidationError } from "@vercel/sdk/models/responsevalidationerror.js";
import { execSync } from "node:child_process";

const token: string | undefined = process.env.VERCEL_TOKEN;
if (!token) {
  console.error("Missing VERCEL_TOKEN in .env");
  process.exit(1);
}

async function main(): Promise<void> {
  try {
    const envTeamId: string | undefined =
      process.env.VERCEL_TEAM_ID || undefined;
    const vercel = new Vercel({ bearerToken: token });

    let resolvedTeamId = envTeamId;
    if (!resolvedTeamId) {
      const teamsResp = await vercel.teams.getTeams({ limit: 2 });
      const teams = teamsResp.teams;
      if (teams.length === 1) {
        resolvedTeamId = teams[0].id;
        console.log(`Using team ID: ${resolvedTeamId}`);
      } else if (teams.length === 0) {
        throw new Error("No team found.");
      } else {
        throw new Error(
          `Token has access to multiple teams; set VERCEL_TEAM_ID. Teams: ${teams
            .map((t) => `${t.id}:${t.slug || t.name}`)
            .join(", ")}`,
        );
      }
    }

    const allProjects: GetProjectsProjects[] = [];
    let from: string | undefined = undefined;
    for (;;) {
      let result: GetProjectsResponseBody;
      try {
        result = await vercel.projects.getProjects({
          teamId: resolvedTeamId,
          from,
          limit: "100",
        });
      } catch (err) {
        // because of https://github.com/vercel/sdk/issues/175
        if (err instanceof ResponseValidationError) {
          // Skip validation
          result = err.rawValue as GetProjectsResponseBody;
        } else {
          throw err;
        }
      }
      allProjects.push(...result.projects);
      const next: unknown = (result as any)?.pagination?.next;
      if (next === null || typeof next === "undefined") {
        break;
      }
      from = String(next);
    }

    if (!allProjects.length) {
      console.log("No projects found.");
      return;
    }

    fs.writeFileSync("output.ndjson", "");
    for (const project of allProjects) {
      let repo: { url: string; isArchived?: boolean | null } | null = null;
      if (project.link) {
        if (project.link.type === "github") {
          const org = project.link.org;
          const name = project.link.repo;
          let isArchived: boolean | null = null;
          try {
            const out = execSync(
              `gh repo view ${org}/${name} --json isArchived --jq .isArchived`,
              { stdio: ["ignore", "pipe", "ignore"] },
            )
              .toString()
              .trim();
            if (out === "true") isArchived = true;
            else if (out === "false") isArchived = false;
          } catch {
            isArchived = null;
          }
          repo = {
            url: `https://github.com/${org}/${name}`,
            isArchived,
          };
        } else {
          repo = { url: "TODO: Add other repo types" };
        }
      }

      const lastDeployment = project.latestDeployments?.[0];
      const lastDeploymentDate = lastDeployment?.createdAt;
      const productionTarget = project.targets?.["production"];

      fs.appendFileSync(
        "output.ndjson",
        JSON.stringify({
          id: project.id,
          name: project.name,
          createdAt: project.createdAt
            ? new Date(project.createdAt).toISOString()
            : null,
          updatedAt: project.updatedAt
            ? new Date(project.updatedAt).toISOString()
            : null,
          lastDeploymentUrl: lastDeployment?.url,
          productionTargetUrl: productionTarget?.url,
          productionTargetAliases: productionTarget?.alias,
          repo: repo,
          lastDeploymentDate: lastDeploymentDate
            ? new Date(lastDeploymentDate).toISOString()
            : null,
          env: project.env?.map((env) => ({
            key: env.key,
            target: env.target,
          })),
        }) + "\n",
      );
    }
  } catch (error) {
    console.error("Error fetching projects:", error);
    process.exit(1);
  }
}

void main();
