# INT Globe

Interactive world map with two pin layers:
- **Personal Stories** — "where I'm from" stories from people across the organisation
- **Case / Mission Stories** — project/case pins by geography

Both layers can be toggled independently. Users sign in with their Microsoft/Entra ID account to add and manage their own pins.

## Architecture

| Layer | Service | SKU | Est. cost |
|-------|---------|-----|-----------|
| Frontend + API hosting | Azure Static Web Apps | Free | $0/month |
| Database | Azure SQL | Basic (5 DTU) | ~$5/month |
| Auth | Entra ID via SWA built-in | — | $0 |

## One-time Setup

### 1. Deploy Azure infrastructure

```bash
az login
az group create --name rg-int-globe --location eastus
az deployment group create \
  --resource-group rg-int-globe \
  --template-file infra/main.bicep \
  --parameters sqlAdminLogin=intglobeadmin sqlAdminPassword="YourStr0ngP@ssword"
```

Note the `sqlServerFqdn` output value.

### 2. Run the database schema

Azure portal → your SQL Database → **Query editor** → paste and run `database/schema.sql`.

### 3. Create the Static Web App

```bash
az staticwebapp create \
  --name int-globe-swa \
  --resource-group rg-int-globe \
  --source https://github.com/FJClausen/int-globe \
  --location eastus2 \
  --branch main \
  --app-location src \
  --api-location api \
  --output-location "" \
  --login-with-github
```

Copy the **deployment token** from the SWA portal (Settings > Deployment token).

### 4. Add GitHub secret

Repo > **Settings > Secrets and variables > Actions > New repository secret**:

| Name | Value |
|------|-------|
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | token from step 3 |

### 5. Add application settings

SWA portal > **Configuration > Application settings**:

| Key | Value |
|-----|-------|
| `AZURE_SQL_SERVER` | `<fqdn from step 1>` |
| `AZURE_SQL_DATABASE` | `int-globe` |
| `AZURE_SQL_USER` | `intglobeadmin` |
| `AZURE_SQL_PASSWORD` | your password |

Push any commit to `main` to trigger the first deployment.

## Local Development

```bash
cd api
npm install

# Create local settings file (gitignored)
cat > local.settings.json << 'EOF'
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AZURE_SQL_SERVER": "yourserver.database.windows.net",
    "AZURE_SQL_DATABASE": "int-globe",
    "AZURE_SQL_USER": "youradmin",
    "AZURE_SQL_PASSWORD": "yourpassword"
  }
}
EOF

func start        # API on http://localhost:7071
npx serve ../src  # frontend on http://localhost:3000
```

## Project Structure

```
int-globe/
|- src/                          # Static frontend
|  |- index.html
|  |- styles.css
|  |- app.js
|  +- staticwebapp.config.json
|- api/                          # Azure Functions v4 (Node 18)
|  |- src/functions/
|  |  |- db.js           shared SQL connection pool
|  |  |- getPins.js      GET  /api/pins
|  |  |- upsertPin.js    POST /api/pins
|  |  +- deletePin.js    DELETE /api/pins/{id}
|  |- package.json
|  +- host.json
|- database/
|  +- schema.sql
|- infra/
|  +- main.bicep
+- .github/workflows/
   +- azure-static-web-apps.yml
```

## Restricting Auth to a Specific Entra Tenant

By default, SWA accepts any Microsoft account. To restrict to your organisation's tenant, add to `src/staticwebapp.config.json`:

```json
"auth": {
  "identityProviders": {
    "azureActiveDirectory": {
      "registration": {
        "openIdIssuer": "https://login.microsoftonline.com/YOUR_TENANT_ID/v2.0",
        "clientIdSettingName": "AAD_CLIENT_ID",
        "clientSecretSettingName": "AAD_CLIENT_SECRET"
      }
    }
  }
}
```

Then register an app in Entra ID and add `AAD_CLIENT_ID` and `AAD_CLIENT_SECRET` to SWA application settings.
