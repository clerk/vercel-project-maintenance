echo "Projects that we not deployed in the last year"
jq -r 'select( .lastDeploymentDate < "'$(date -v-1y "+%Y-%m-%dT%H:%M:%SZ")'" ) | "- [`" + .name + "`](https://vercel.com/clerk-production/" + .name + ")\n  - url: https://" + .productionTargetAliases[0] + "\n  - repo: " + .repo.url + "\n  - last deployment: " + .lastDeploymentDate' output.ndjson

echo "Projects that were never deployed"
jq -r 'select( .lastDeploymentDate == null ) | "- [`" + .name + "`](https://vercel.com/clerk-production/" + .name + ")\n  - url: https://" + .productionTargetAliases[0] + "\n  - repo: " + .repo.url' output.ndjson

echo "Projects that are archived"
jq -r 'select( .repo.isArchived ) | "- [`" + .name + "`](https://vercel.com/clerk-production/" + .name + ")\n  - url: https://" + .productionTargetAliases[0] + "\n  - repo: " + .repo.url + "\n  - last deployment: " + .lastDeploymentDate' output.ndjson