#!/usr/bin/env bash
# Check that VERCEL_TOKEN can open the admin project before `vercel pull`.
#
# `vercel pull` only says "Could not retrieve Project Settings" when the token,
# the team (VERCEL_ORG_ID) and the project (VERCEL_PROJECT_ID) don't fit
# together. This asks the Vercel API directly and says which part is wrong.
# It prints the token's user name and the teams it can see, never the token.
# GitHub masks secret values in logs, so the configured team shows as ***.
set -euo pipefail

: "${VERCEL_TOKEN:?VERCEL_TOKEN is required}"
: "${VERCEL_ORG_ID:?VERCEL_ORG_ID is required}"
: "${VERCEL_PROJECT_ID:?VERCEL_PROJECT_ID is required}"

# Calls the Vercel API with the token; prints the JSON body even on 4xx.
vercel_api() {
  curl -sS --max-time 20 -H "Authorization: Bearer $VERCEL_TOKEN" "https://api.vercel.com$1"
}

token_user=$(vercel_api /v2/user | jq -r '.user.username // ("none (" + (.error.code // "unknown") + ")")')
echo "Token belongs to user: $token_user"

echo "Teams this token can see:"
vercel_api /v2/teams | jq -r 'if .teams then (.teams[] | "  - \(.slug) (\(.id))") else "  none (" + (.error.code // "unknown") + ")" end'

project_response=$(vercel_api "/v9/projects/$VERCEL_PROJECT_ID?teamId=$VERCEL_ORG_ID")
project_name=$(jq -r '.name // empty' <<<"$project_response")
if [ -n "$project_name" ]; then
  echo "Vercel opens the project: $project_name"
  exit 0
fi

error_code=$(jq -r '.error.code // "unknown"' <<<"$project_response")
error_message=$(jq -r '.error.message // ""' <<<"$project_response")
without_team=$(vercel_api "/v9/projects/$VERCEL_PROJECT_ID" | jq -r '.name // .error.code // "unknown"')
echo "::error title=Vercel cannot open the admin project::With VERCEL_ORG_ID as the team, Vercel answered '$error_code' ($error_message). Asked without a team, it answered '$without_team'. VERCEL_PROJECT_ID must belong to the team in VERCEL_ORG_ID, and VERCEL_TOKEN must be an account token with access to that team. Nothing was deployed."
exit 1
