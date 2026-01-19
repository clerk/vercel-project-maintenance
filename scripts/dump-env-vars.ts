import "dotenv/config";
import fs from "fs";
import { Vercel } from "@vercel/sdk";

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

    const allProjects = [];
    let from: string | undefined = undefined;
    for (;;) {
      let result = await vercel.projects.getProjects({
        teamId: resolvedTeamId,
        from,
        limit: "100",
      });

      if (Array.isArray(result)) {
        allProjects.push(...result);
        break;
      } else {
        allProjects.push(...result.projects);
        const next = result.pagination?.next;
        if (next === null || typeof next === "undefined") {
          break;
        }
        from = String(next);
      }
    }

    if (!allProjects.length) {
      console.log("No projects found.");
      return;
    }

    const output = [];

    for (const project of allProjects) {
      console.log(`Processing project: ${project.name} (${project.id})`);

      const projectEnv = [];

      if (project.env && project.env.length > 0) {
        for (const envVar of project.env) {
          const envResponse = await vercel.projects.getProjectEnv({
            idOrName: project.id,
            id: envVar.id!,
            teamId: resolvedTeamId,
          });

          projectEnv.push({
            key: envVar.key,
            value: (<any>envResponse).value,
            environment: envVar.target,
          });
        }
      }

      output.push({
        id: project.id,
        name: project.name,
        env: projectEnv,
      });
    }

    fs.writeFileSync("env-vars-output.json", JSON.stringify(output, null, 2));
    console.log(
      `\nDumped environment variables for ${output.length} projects to env-vars-output.json`,
    );
  } catch (error) {
    console.error("Error fetching projects:", error);
    process.exit(1);
  }
}

void main();
