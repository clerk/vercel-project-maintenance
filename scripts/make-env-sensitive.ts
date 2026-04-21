import "dotenv/config";
import { Vercel } from "@vercel/sdk";
import * as readline from "readline";
import { CreateProjectEnv1Target } from "@vercel/sdk/models/createprojectenvop.js";

const token: string | undefined = process.env.VERCEL_TOKEN;
if (!token) {
  console.error("Missing VERCEL_TOKEN in .env");
  process.exit(1);
}

function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function askConfirmation(
  rl: readline.Interface,
  question: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

async function main(): Promise<void> {
  const projectName = process.argv[2];
  if (!projectName) {
    console.error("Usage: tsx scripts/make-env-sensitive.ts <project-name>");
    process.exit(1);
  }

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

    // Find the project by name
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

    const project = allProjects.find((p) => p.name === projectName);
    if (!project) {
      console.error(`Project "${projectName}" not found.`);
      process.exit(1);
    }

    console.log(`Found project: ${project.name} (${project.id})`);

    // Fetch all environment variables
    if (!project.env || project.env.length === 0) {
      console.log("No environment variables found for this project.");
      return;
    }

    const rl = createReadlineInterface();

    // Process each environment variable
    for (const envVar of project.env) {
      const targets = Array.isArray(envVar.target)
        ? envVar.target
        : envVar.target
          ? [envVar.target]
          : [];
      const hasDevelopment = targets.includes("development");
      const otherTargets = targets.filter((t) => t !== "development");

      // Skip if only used in development environments
      if (hasDevelopment && otherTargets.length === 0) {
        continue;
      }

      if (envVar.key.includes("PUBLIC")) {
        console.log(`Skipping public variable ${envVar.key}`);
        continue;
      }

      // Get the decrypted value to check if it's already sensitive
      const envResponse = await vercel.projects.getProjectEnv({
        idOrName: project.id,
        id: envVar.id!,
        teamId: resolvedTeamId,
      });

      // Skip if already sensitive (value is missing)
      const value = (envResponse as any).value;
      if (!value) {
        console.log(`Skipping ${envVar.key} (already sensitive or no value)`);
        continue;
      }

      // Show what we're about to do and ask for confirmation
      const newTargets: CreateProjectEnv1Target[] = otherTargets;
      console.log("\n" + "=".repeat(60));
      console.log(`Variable: ${envVar.key}`);
      console.log(`Current targets: ${targets.join(", ")}`);
      if (hasDevelopment) {
        console.log(
          `New targets: ${newTargets.join(", ")} (development removed)`,
        );
      }
      console.log(
        `Current value: ${value.substring(0, 50)}${value.length > 50 ? "..." : ""}`,
      );
      console.log(`Comment: ${envVar.comment}`);
      console.log(
        `\nAction: Delete and recreate as 'sensitive' type${hasDevelopment ? ", removing development target" : ""}`,
      );
      console.log("=".repeat(60));

      const confirmed = await askConfirmation(rl, "\nProceed? (y/n): ");

      if (!confirmed) {
        console.log("Skipped.\n");
        continue;
      }

      try {
        // Delete the environment variable
        console.log(`Deleting ${envVar.key}...`);
        await vercel.projects.removeProjectEnv({
          idOrName: project.id,
          id: envVar.id!,
          teamId: resolvedTeamId,
        });

        // Recreate as sensitive
        console.log(`Creating ${envVar.key} as sensitive...`);
        await vercel.projects.createProjectEnv({
          idOrName: project.id,
          teamId: resolvedTeamId,
          requestBody: {
            key: envVar.key,
            value: value,
            type: "sensitive",
            target: newTargets,
            comment: envVar.comment,
          },
        });

        console.log(`✓ Successfully converted ${envVar.key} to sensitive\n`);
      } catch (error) {
        console.error(`✗ Error processing ${envVar.key}:`, error);
        console.log("");
      }
    }

    rl.close();
    console.log("Done!");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

void main();
