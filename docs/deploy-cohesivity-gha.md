# Deploy Cohesivity via GitHub Actions

Manual-only deploy to Cohesivity Railway. It does **not** run on push or pull request.

Workflow: [`.github/workflows/deploy-cohesivity.yml`](../.github/workflows/deploy-cohesivity.yml)  
Script: [`deploy_railway.py`](../deploy_railway.py)

## Who can run it

Collaborators with **write** access to the repo can start the workflow from the Actions tab. Read-only collaborators cannot. An admin must configure repository secrets once before the first successful run.

## One-time: add repository secrets

Repo **Settings → Secrets and variables → Actions → New repository secret**.

### Required (mapped into `.cohesivity` for `deploy_railway.py`)

| GitHub secret | Written as `.cohesivity` key |
| --- | --- |
| `COH_MANAGEMENT_KEY` | `coh_management_key` |
| `COH_APPLICATION_KEY` | `coh_application_key` |
| `TENANT_ID` | `tenant_id` |

### Optional (written to `.env` if present; upserted to Railway when set)

- `GEMINI_API_KEY`
- `OPENROUTER_API_KEY`
- `APIFY_API_TOKEN`
- `CANVA_CLIENT_ID`
- `CANVA_CLIENT_SECRET`
- `FIGMA_CLIENT_ID`
- `FIGMA_CLIENT_SECRET`
- `FIGMA_ACCESS_TOKEN`
- `YT_WORKER_SECRET`

Do not commit `.cohesivity`, `.env`, or `.env.local`. Never paste secret values into workflow files or docs.

## Run a deploy

1. Open the repo on GitHub → **Actions**.
2. Select **Deploy Cohesivity** in the left workflow list.
3. Click **Run workflow**.
4. Leave **environment** as `production`.
5. Click the green **Run workflow** button.

The job checks out the default branch ref you selected, writes credentials from secrets, and runs `python deploy_railway.py`. Builds can take several minutes.

## Certainty / caveats

- Yes: `workflow_dispatch` is the supported way to require an explicit human trigger; collaborators with write can use **Run workflow**.
- The workflow will fail until the three required secrets are configured.
- Optional app secrets are skipped when unset; missing `GEMINI_API_KEY` means Railway will not get that var from this run.
- This workflow intentionally has no `on: push` / `on: pull_request` triggers.
